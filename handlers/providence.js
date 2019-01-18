const {
    global: globalOpts,
    database: databaseOpts,
    subscribe: subscribeOpts,
    injectOptions
} = require('./_options')

const AmqpSubscriber = require('../lib/amqp-subscribe')
const parseDanmaku = require('../lib/providence-danmaku-parser')
const { MongoDump } = require('../lib/_mongo')
const moment = require('moment-timezone')
const { autoRetry, getRoomInfo, getRoomUser } = require('../lib/bili-api')
const parseFiles = require('../lib/parse-files')
const fs = require('fs')
const formatBytes = size => require('bytes').format(size, {fixedDecimals: true})
const readline = require('readline')
const { basename } = require('path')
const { DanmakuHistory } = require('../lib/danmaku')
const { transformDanmaku } = require('./dmk')
const RaffleFilter = require('../lib/raffle-filter')
const hostname = require('os').hostname()
const writeTtyStatLine = require('../lib/write-tty-stat-line')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const toStatTime = date => {
    // Use time 0800 (CST / +8) as day delimiter
    const statDay = moment(date).tz('Asia/Shanghai').subtract(8, 'hours').format('YYYY-MM-DD')
    return moment.tz(`${statDay} 08:00:00.000`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Shanghai').toDate()
}

function getHostSummaryUpdate(parsedDanmaku) {
    const {
        uname,
        action,
        gold = 0,
        silver = 0,
        ...rest
    } = parsedDanmaku

    return (
          action === 'DANMAKU' ? {
            $inc: { danmaku: 1 },
        }
        : action === 'GIFT' ? {
            $inc: {
                gold,
                silver,
                [`giftSum.${rest.giftName}.num`]: rest.giftNum
            },
            $set: { [`giftSum.${rest.giftName}.type`]: rest.coinType },
            $max: { [`giftSum.${rest.giftName}.price`]: rest.price },
        }
        : action === 'GUARD' ? {
            $inc: {
                gold,
                silver,
                [`guardSum.${rest.guardName}.num`]: rest.guardNum
            },
            $set: { [`guardSum.${rest.guardName}.type`]: rest.coinType },
            $max: { [`guardSum.${rest.guardName}.price`]: rest.price },
        }
        : null
    )
}

function getUserSummaryUpdate(parsedDanmaku) {
    const {
        uname,
        action,
        gold = 0,
        silver = 0,
        ...rest
    } = parsedDanmaku

    return (
          action === 'DANMAKU' ? {
            $set: { uname },
            $inc: { danmaku: 1 },
            $push: {
                'danmakus': {
                    $each: [{ text: rest.text }],
                    $slice: -50000,    // limit maximum amount of danmakus kept in each log entry
                },
            },
        }
        : action === 'GIFT' ? {
            $inc: {
                gold,
                silver,
                [`giftSum.${rest.giftName}.num`]: rest.giftNum
            },
            $set: { uname, [`giftSum.${rest.giftName}.type`]: rest.coinType },
            $max: { [`giftSum.${rest.giftName}.price`]: rest.price },
        }
        : action === 'GUARD' ? {
            $inc: {
                gold,
                silver,
                [`guardSum.${rest.guardName}.num`]: rest.guardNum
            },
            $set: { uname, [`guardSum.${rest.guardName}.type`]: rest.coinType },
            $max: { [`guardSum.${rest.guardName}.price`]: rest.price },
        }
        : null
    )
}

// TODO: aggregate updates based on id to improve batch performance
function upsertWithRetry(dbConn, coll, id, updateOperator) {
    let retryCount = 0

    const updateFn = _ => dbConn.getConn().then(
        conn => conn.db().collection(coll).updateOne(
            { _id: id },
            updateOperator,
            { upsert: true },
        ).catch(err => {
            if (err.code === 11000) {
                // retry if we found duplicate key error
                if (++retryCount > 10) {
                    console.error(`retry count exceeded: ${err.message}`)
                    return dbConn.errorHandler(err)
                } else {
                    return sleep(100).then(updateFn)
                }
            } else {
                console.error(err)
                return dbConn.errorHandler(err)
            }
        })
    )

    return updateFn()
}

async function updateHostInfo(dbConn, canonicalRoomId) {
    const roomInfo = await autoRetry(getRoomInfo, canonicalRoomId)
    const { roomId } = roomInfo

    const userInfo = await autoRetry(getRoomUser, roomId)
    const { uid } = userInfo

    dbConn && dbConn.getConn().then(
        conn => conn.db().collection('user').updateOne(
            { _id: uid },
            { $set: { ...roomInfo, ...userInfo },
              $currentDate: { _lastModified: true },
            },
            { upsert: true }
        ).catch(dbConn.errorHandler)
    )

    if (roomInfo.liveStatus === 1) {
        dbConn && dbConn.getConn().then(
            conn => conn.db().collection('providence_live_history').insertOne({
                roomId,
                liveStartsAt: roomInfo.liveStartsAt,
                title: roomInfo.title,
            }).catch(dbConn.errorHandler)
        )
    }
}

async function handleStatisticalMessage(dbConn, msg) {
    const parsed = parseDanmaku(msg)
    if (!parsed) return

    const updateHost = getHostSummaryUpdate(parsed)
    const updateUser = getUserSummaryUpdate(parsed)
    const statTime = toStatTime(msg._rxTime)

    await Promise.all([
        updateHost && upsertWithRetry(
            dbConn,
            'providence_host',
            { time: statTime, roomId: msg.roomId },
            updateHost
        ),
        updateUser && upsertWithRetry(
            dbConn,
            'providence_user',
            { time: statTime, uid: parsed.uid, roomId: msg.roomId },
            updateUser
        ),
    ])
}

async function handleCommandMessage(dbConn, msg, {performApiRequests = false} = {}) {
    const HOST_INFO_UPDATE_DELAY = 180 * 1000    // 3 min

    if (performApiRequests && msg.cmd === 'READY') {    // host is going on line
        setTimeout(_ => updateHostInfo(dbConn, msg.roomId), HOST_INFO_UPDATE_DELAY)
    }
    if (performApiRequests && msg.cmd === 'PREPARING') {    // host is going off live
        setTimeout(_ => updateHostInfo(dbConn, msg.roomId), HOST_INFO_UPDATE_DELAY)
    }
    if (msg.cmd === 'WARNING') {    // admin is visiting, must be something of interest
        await (
            dbConn && dbConn.getConn().then(
                conn => conn.db().collection('user').updateOne(
                    { roomId: msg.roomId },
                    {
                        $inc: { total_warnings: 1 },
                        $push: {
                            'warnings': {
                                $each: [{ time: new Date(msg._rxTime), text: msg.msg }],
                                $slice: -10,
                            },
                        }
                    },
                ).catch(dbConn.errorHandler)
            )
        )
    }
}

function guessRoomIdFromPath(str) {
    const m = /\d+/.exec(basename(str))
    return m ? parseInt(m[0], 10) : null
}

function danmakuLineFilter(roomId, processPayload) {
    const dmkHistory = new DanmakuHistory()
    const raffleFilter = new RaffleFilter(processPayload)

    return line => {
        if (line === null) {
            raffleFilter(null)
            return
        }

        if (!line.startsWith('DANMAKU')) {
            return
        }

        const {
            server,
            rx_time,
            danmaku
        } = JSON.parse(line.slice(8))

        const dmkStr = JSON.stringify(danmaku)

        if (!dmkHistory.has(dmkStr)) {
            dmkHistory.put(dmkStr)

            const payload = {
                ...transformDanmaku(danmaku),
                roomId: roomId,
                _rxTime: rx_time,
                _txServer: server,
                _worker: `offline-${hostname}`,
            }

            if (payload.cmd === 'DANMU_MSG') {
                raffleFilter(payload.text, payload._rxTime, payload)
            } else {
                processPayload(payload)
            }
        }
    }
}

module.exports = {
    yargs: yargs => injectOptions(yargs, globalOpts, subscribeOpts, databaseOpts)
        .option('i', {
            alias: 'input',
            describe: 'work on input danmaku log files, supports globbing; file name must contains canonical room id',
            type: 'array',
            coerce: parseFiles
        })
    ,

    handler: async argv => {
        const {
            subscribeUrl,
            subscribeName,
            db,
            input,
        } = argv

        const dbConn = new MongoDump(db)

        await dbConn.connectWithTimeout(5000).catch(err => {
            if (input) {
                console.error('mongo: not established, terminating')
                process.exit(1)
            } else {
                console.error('mongo: connection not established yet, continue anyway.')
            }
        })

        if (!input) {
            // work from amqp
            process.on('SIGTERM', _ => process.exit(0))

            const sub = new AmqpSubscriber(subscribeUrl, subscribeName)
            sub.connect()
            sub.on('message', _msg => handleStatisticalMessage(dbConn, JSON.parse(_msg)))
            sub.on('message', _msg => handleCommandMessage(dbConn, JSON.parse(_msg)))
        } else {
            // work on input files
            const LINES_HIGHWATER_MARK = 10000
            const files = input.map(inputPath => ({
                path: inputPath,
                roomId: guessRoomIdFromPath(inputPath),
                size: fs.statSync(inputPath).size,
            })).sort(
                (a, b) => b.size - a.size
            )

            let numTotalValid = 0
            let numTotalFinished = 0

            await Promise.all(files.map(async ({path, roomId}) => {
                let fileEnd = false
                let danmakuQueue = []

                const lineFilter = danmakuLineFilter(
                    roomId,
                    payload => {
                        numTotalValid += 1
                        if (numTotalValid > numTotalFinished + LINES_HIGHWATER_MARK) {
                            rl.pause()
                        }
                        danmakuQueue.push(payload)
                    }
                )

                const rl = readline.createInterface({ input: fs.createReadStream(path) })
                rl.on('line', line => lineFilter(line))
                rl.on('close', _ => {
                    lineFilter(null)
                    fileEnd = true
                })

                while (!fileEnd || danmakuQueue.length) {
                    if (!danmakuQueue.length) {
                        await sleep(10)    // sleep for short period to allow IO
                        continue
                    }
                    const payload = danmakuQueue.shift()

                    await handleStatisticalMessage(dbConn, payload, {performApiRequests: false})
                    await handleCommandMessage(dbConn, payload, {performApiRequests: false})

                    numTotalFinished += 1

                    // readline flow control
                    if (!fileEnd && numTotalValid <= numTotalFinished + LINES_HIGHWATER_MARK / 2) {
                        rl.resume()
                    }

                    if (numTotalFinished % 100 === 0) {
                        writeTtyStatLine(`  prog: ${numTotalFinished} / ${numTotalValid} @ ${formatBytes(process.memoryUsage().rss)}`)
                    }
                }
            }))

            writeTtyStatLine(`  prog: ${numTotalFinished} / ${numTotalValid} @ ${formatBytes(process.memoryUsage().rss)}\n`)
            dbConn.close()
        }
    },

    handleStatisticalMessage,
    handleCommandMessage,

    toStatTime
}