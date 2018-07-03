const { global: injectGlobalOptions, output: injectOutputOptions } = require('./_options')
const RUN = require('./run')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
    yargs: yargs => injectOutputOptions(injectGlobalOptions(yargs))
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
        // TODO: exit gracefully
        while (true) {
            await RUN.handler({
                ...argv,
                daemon: true    // use daemon flag to prevent suicide on failure
            })
            await sleep(argv.interval * 1000)
        }
    }
}