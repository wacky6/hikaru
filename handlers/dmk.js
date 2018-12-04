const { global: injectGlobalOptions } = require('./_options')
const { getRoomInfo } = require('../lib/bili-api')
const { HighAvailabilityDanmakuStream } = require('../lib/danmaku')
const { defaultEndpoint, defaultExchangeName } = require('../lib/_amqp')
const AmqpPublisher = require('../lib/amqp-publish')
const expandStringTemplate = require('../lib/string-template')

module.exports = {
    yargs: yargs => injectGlobalOptions(yargs)
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
            default: 'hikaru-dmk'
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
            worker
        } = argv

        const publisher = publish && new AmqpPublisher(publishUrl, publishName)
        publisher && publisher.connect()

        room_id.forEach(async room_id => {
            const { roomId, title } = await getRoomInfo(room_id)

            const roomLogPath = logPath && expandStringTemplate(logPath, {roomid: roomId})
            const dmk = new HighAvailabilityDanmakuStream(roomId, { logPath: roomLogPath, redundency })

            dmk.connect()

            dmk.on('danmaku', (danmakuStr, meta) => {
                publisher && publisher.send({
                    roomId,
                    worker,
                    server: meta.server,
                    rxTime: meta.rx_time,
                    danmaku: JSON.parse(danmakuStr)
                })
            })

            console.log(`monitoring ${roomId} ${title}`)
        })
    },
}
