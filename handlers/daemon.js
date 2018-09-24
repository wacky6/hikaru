const {
    global: globalOpts,
    output: outputOpts,
    telegram: telegramOpts,
    injectOptions
} = require('./_options')
const RUN = require('./run')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
    yargs: yargs => injectOptions(yargs, globalOpts, outputOpts, telegramOpts)
        .usage('$0 daemon <room_id> [options]')
        .positional('room_id', {
            describe: 'room id or live url',
            type: 'string'
        })
        .option('i', {
            alias: 'interval',
            describe: 'status check interval, in seconds, rec. >60s',
            type: 'number',
            default: 60
        })
    ,
    handler: async argv => {
        while (true) {
            const ret = await RUN.handler({
                ...argv,
                daemon: true    // use daemon flag to prevent suicide on failure
            })

            const interval = !ret ? argv.interval : 5    // if errored, retry aggressively
            await sleep(interval * 1000)
        }
    }
}