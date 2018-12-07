const { global: injectGlobalOptions, database: injectDatabaseOptions } = require('./_options')
const { autoRetry, getRoomInfo, getRoomUser } = require('../lib/bili-api')
const { HighAvailabilityDanmakuStream } = require('../lib/danmaku')
const { defaultEndpoint, defaultExchangeName, defaultHealthExchangeName } = require('../lib/_amqp')
const { MongoDump } = require('../lib/_mongo')
const AmqpPublisher = require('../lib/amqp-publish')
const expandStringTemplate = require('../lib/string-template')
const setupSigterm = require('../lib/sigterm-handler')
const RaffleFilter = require('../lib/raffle-filter')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const BROADCAST_CMDS = new Set([
    'SYS_MSG',
    'NOTICE_MSG',
    'GUARD_LOTTERY_START',
    'ROOM_RANK',
    'WISH_BOTTLE',
    'TV_START',
    'TV_END',
    'ACTIVITY_EVENT',
    'GUARD_MSG',
    'RAFFLE_START',
    'SYS_GIFT',
])

function transformDanmaku(dmk) {
    if (!dmk) return dmk

    const cmd = dmk.cmd
    if (cmd === 'DANMU_MSG') {
        const [
            config,           // 弹幕设置？
            text,             // 弹幕内容
            user,             // 用户
            userBadge,        // 用户勋章
            userRank,         // 用户等级
            userTitle,        // 头衔
            arg6,             // mostly 0
            userGuardLevel,   // 1, 2, 3 === 总督，提督，舰长
            arg8,             // mostly are { uname_color: "" }
        ] = dmk.info

        return {
            cmd,
            config,
            text,
            user: {
                id: user[0],
                name: user[1],
                title: userTitle && userTitle[0],
                guardLevel: userGuardLevel,
                liveVip: user[3],          // 姥爷？
                liveAnnualVip: user[4],    // 年费姥爷？
                liveLevel: userRank[0],
                liveRankDescription: userRank[3],
            },
            badge: {
                id: userBadge[4],      // badge's unique id ?
                level: userBadge[0],
                name: userBadge[1],
                idol: userBadge[2],
                roomId: userBadge[3],
            },
        }
    } else if (dmk.data && typeof dmk.data === 'object') {
        return {
            cmd,
            ...dmk.data
        }
    } else {
        return dmk
    }
}

module.exports = {
    yargs: yargs => injectDatabaseOptions(injectGlobalOptions(yargs))
        .usage('$0 dmk <room_id..>')
        .positional('room_id', {
            describe: 'room id or live url',
            type: 'string',
        })
        .option('l', {
            alias: 'log-path',
            type: 'string',
            describe: 'danmaku log file, supports @roomid placeholder',
        })
        .option('r', {
            alias: 'redundency',
            type: 'number',
            describe: 'server dedundency, 1-2',
            default: 1,
        })
        .option('p', {
            alias: 'publish',
            type: 'boolean',
            describe: 'enable danmaku publishing',
            default: false,
        })
        .option('h', {
            alias: 'publish-health',
            type: 'boolean',
            describe: 'enable health stats publishing',
            default: false,
        })
        .option('P', {
            alias: 'publish-url',
            type: 'string',
            describe: 'amqp publish url',
            default: defaultEndpoint,
        })
        .option('n', {
            alias: 'publish-name',
            type: 'string',
            describe: 'amqp publish exchange name',
            default: defaultExchangeName,
        })
        .option('b', {
            alias: 'publish-broadcast',
            type: 'boolean',
            describe: 'publish broadcast messages (SYS, NOTICE, LOTTERY, RAFFLE, ACTIVITY, WISH)',
            default: false,
        })
        .option('w', {
            alias: 'worker',
            type: 'string',
            describe: 'worker identifier',
            default: require('os').hostname() || 'hikaru-dmk',
        })
        .option('R', {
            alias: 'raffle-filter',
            type: 'boolean',
            describe: 'enable raffle filter, remove excessive danmaku',
            default: false,
        })
    ,

    handler: async argv => {
        const {
            room_id,
            logPath,
            redundency,
            publish,
            publishUrl,
            publishName,
            publishHealth,
            publishBroadcast: publishBroadcastMessages,
            worker,
            db,
            dump,
            raffleFilter: enableRaffleFilter,
        } = argv

        const publisher = publish && new AmqpPublisher(publishUrl, publishName)
        const healthPublisher = publishHealth && new AmqpPublisher(publishUrl, defaultHealthExchangeName)
        const dbConn = dump && new MongoDump(db, 'danmaku')

        setupSigterm()

        if (dbConn) {
            await Promise.race([
                dbConn.connect(),
                sleep(5000)
            ]).then(
                ret => ret || console.error('mongo: connection not established yet, continue anyway.')
            )
        }

        const shouldDeferAtStartUp = room_id.length >= 3

        room_id.forEach(async (room_id, idx) => {
            if (shouldDeferAtStartUp) {
                // randomly sleep for 0.25-0.75 BASE_DELAY for each room
                const BASE_DELAY = 10000
                await sleep(Math.floor((idx + 0.25 + Math.random() / 2) * BASE_DELAY))
            }

            const roomInfo = await autoRetry(getRoomInfo, room_id)
            const { roomId } = roomInfo

            const userInfo = await autoRetry(getRoomUser, roomId)
            const { uid, name } = userInfo

            dbConn && dbConn.getConn().then(
                conn => conn.db().collection('user').updateOne(
                    { _id: uid },
                    { $set: { ...roomInfo, ...userInfo },
                      $currentDate: { _lastModified: true },
                    },
                    { upsert: true }
                ).catch(dbConn.errorHandler)
            )

            const roomLogPath = logPath && expandStringTemplate(logPath, {roomid: roomId})
            const dmk = new HighAvailabilityDanmakuStream(roomId, { logPath: roomLogPath, redundency })

            dmk.connect()

            dmk.on('hads', ({event, server}) => {
                healthPublisher && healthPublisher.send({
                    event,
                    server,
                    roomId,
                    time: Date.now(),
                    worker,
                })
            })

            const processPayload = payload => {
                // ignore broadcast-like messages
                if (!publishBroadcastMessages && BROADCAST_CMDS.has(payload.cmd)) {
                    return
                }
                publisher && publisher.send(payload)
                dbConn && dbConn.getConn().then(
                    conn => conn.db().collection('danmaku').insertOne({
                        ...payload,
                        _rxTime: new Date(payload._rxTime)
                    }).catch(dbConn.errorHandler)
                )
            }

            const raffleFilter = RaffleFilter(processPayload)

            dmk.on('danmaku', (danmakuStr, meta) => {
                const payload = {
                    ...transformDanmaku(JSON.parse(danmakuStr)),
                    roomId,
                    _rxTime: meta.rx_time,
                    _txServer: meta.server,
                    _worker: worker,
                }

                if (payload.cmd === 'DANMU_MSG' && enableRaffleFilter) {
                    raffleFilter(payload.text, payload._rxTime, payload)
                } else {
                    processPayload(payload)
                }
            })

            dmk.once('heartbeat', ({server, rtt}) => {
                console.error(`monitoring: ${room_id} (${roomId})\t${name} (${uid})\t${server} (${rtt}ms)`)
            })
        })
    },
}
