const { global: injectGlobalOptions, database: injectDatabaseOptions } = require('./_options')
const { getRoomInfo } = require('../lib/bili-api')
const { HighAvailabilityDanmakuStream } = require('../lib/danmaku')
const { defaultEndpoint, defaultExchangeName } = require('../lib/_amqp')
const { MongoDump } = require('../lib/_mongo')
const AmqpPublisher = require('../lib/amqp-publish')
const expandStringTemplate = require('../lib/string-template')
const shortid = require('shortid')

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
                title: userTitle[0],
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
        .option('w', {
            alias: 'worker',
            type: 'string',
            describe: 'worker identifier',
            default: require('os').hostname() || 'hikaru-dmk',
        })
    ,

    handler: argv => {
        const {
            room_id,
            logPath,
            redundency,
            publish,
            publishUrl,
            publishName,
            worker,
            db,
            dump
        } = argv

        const publisher = publish && new AmqpPublisher(publishUrl, publishName)
        const dbConn = dump && new MongoDump(db)
        const procId = shortid.generate()

        room_id.forEach(async room_id => {
            const { roomId, title } = await getRoomInfo(room_id)

            const roomLogPath = logPath && expandStringTemplate(logPath, {roomid: roomId})
            const dmk = new HighAvailabilityDanmakuStream(roomId, { logPath: roomLogPath, redundency })

            dmk.connect()

            dmk.on('danmaku', (danmakuStr, meta) => {
                const payload = {
                    ...transformDanmaku(JSON.parse(danmakuStr)),
                    roomId,
                    _rxTime: meta.rx_time,
                    _txServer: meta.server,
                    _worker: worker,
                    _proc: procId,
                }

                publisher && publisher.send(payload)
                dbConn && dbConn.send(payload)
            })

            console.log(`monitoring ${roomId} ${title}`)
        })
    },
}