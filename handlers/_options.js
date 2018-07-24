// global options parser
const parseTelegram = require('../lib/telegram-parser')

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
}