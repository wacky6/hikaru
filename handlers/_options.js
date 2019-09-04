// global options parser
const { hasPosenetSupport } = require('../modular-support')
const parseTelegram = require('../lib/telegram-parser')
const { defaultMongodbConnection } = require('../lib/_mongo')
const { ANALYSIS_BACKENDS } = require('./extract')

module.exports = {
    injectOptions: (yargs, ...opts) =>
        opts.reduce((yargs, opt) => opt(yargs), yargs)
    ,
    global: yargs => yargs
    ,
    extract: yargs => !hasPosenetSupport ? yargs : yargs
        .option('x', {
            alias: 'extract',
            describe: `enable extraction
 : takes an parameter as extraction type
 : supports: ${Object.keys(ANALYSIS_BACKENDS).join(', ')}
 : default: [none]`,
            nargs: 1,
            default: ''
        })
        .option('X', {
            alias: 'extract-args',
            describe: `additional arguments for extraction tool
 : see "hikaru extract --help"`,
            default: ''
        })
        .option('r', {
            alias: 'realtime-analyze',
            describe: `extract while streaming
 : if available cpu is insufficient, frames will be dropped,
 : in this case, extraction may be less accurate`,
            type: 'boolean',
            default: false
        })
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
}