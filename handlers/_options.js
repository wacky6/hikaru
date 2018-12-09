// global options parser
const parseTelegram = require('../lib/telegram-parser')
const { defaultMongodbConnection } = require('../lib/_mongo')
const { defaultEndpoint, defaultExchangeName } = require('../lib/_amqp')

module.exports = {
    injectOptions: (yargs, ...opts) =>
        opts.reduce((yargs, opt) => opt(yargs), yargs)
    ,
    global: yargs => yargs
    ,
    output: yargs => yargs
        .option('O', {
            alias: 'output-dir',
            describe: 'output directory',
            default: '~/hikaru/',
        })
        .option('o', {
            alias: 'output',
            describe: 'output file pattern, use - for stdout',
            default: '@idol_@date_@time.@ext'
        })
        .option('C', {
            alias: 'no-capture',
            describe: 'do not capture stream. useful for notification-only deployment',
            type: 'boolean',
            default: false
        })
        .option('f', {
            alias: 'format',
            describe: 'specify output container format',
            choices: ['flv', 'mp4', 'mkv'],
            default: 'flv'
        })
    ,
    telegram: yargs => yargs
        .option('t', {
            alias: 'telegram',
            describe: 'telegram token and chat_id for notification: <tg-token>:<chat_id>',
            type: 'string',
            coerce: parseTelegram,
            default: ''
        })
        .option('T', {
            alias: 'telegram-endpoint',
            describe: 'telegram HTTP API endpoint',
            type: 'string',
            default: 'https://api.telegram.org'
        })
        .option('s', {
            alias: 'silent',
            describe: 'deliver notification silently',
            type: 'boolean',
            default: false
        })
    ,
    database: yargs => yargs
        .option('db', {
            describe: 'mongodb connection string',
            type: 'string',
            default: defaultMongodbConnection,
        })
        .option('d', {
            alias: 'dump',
            type: 'boolean',
            describe: 'dump danmaku to database, see --db',
            default: false
        })
    ,
    subscribe: yargs => yargs
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
}