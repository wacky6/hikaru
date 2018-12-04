const {
    global: globalOpts,
    telegram: telegramOpts,
    injectOptions
} = require('./_options')

const { defaultEndpoint, defaultExchangeName } = require('../lib/_amqp')
const AmqpSubscriber = require('../lib/amqp-subscribe')

module.exports = {
    yargs: yargs => injectOptions(yargs, globalOpts, telegramOpts)
        .usage('$0 <uid|user..>')
        .positional('uid|user', {
            describe: 'user id or user name fragment'
        })
        .option('S', {
            alias: 'subscribe-url',
            type: 'string',
            describe: 'amqp subscribe url',
            default: defaultEndpoint,
        })
        .option('n', {
            alias: 'subscribe-name',
            type: 'string',
            describe: 'amqp subscribe exchange name',
            default: defaultExchangeName,
        })
    ,
        handler: async argv => {
            const {
                telegramEndpoint,
                telegram = null,
                subscribeUrl,
                subscribeName
            } = argv

            const {
                token,
                chatId
            } = telegram || {}

            const userNames = argv.users.filter($ => typeof $ === 'string')
            const uids = argv.users.filter($ => typeof $ === 'number')

            const subscriber = new AmqpSubscriber(subscribeUrl, subscribeName)
            subscriber.connect()

            subscriber.on('message', msg => {
                console.log(msg)
            })
        }
}