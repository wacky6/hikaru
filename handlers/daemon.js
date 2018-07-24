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
        .option('I', {
            alias: 'abnormal-interval',
            describe: 'status check interval on disruption, in seconds, rec. 10s',
            type: 'number',
            default: 10
        })
        .option('a', {
            alias: 'attempts',
            describe: 'attempts to re-establish streaming before giving up',
            type: 'number',
            default: 12
        })
    ,
    handler: async argv => {
        let state = 'normal'    // either 'normal' or 'abnormal'
        let attemptCounter = argv.attempts

        /* state transition:
         *   state       condition          next_state
         *   normal      host not live      normal
         *               capture success    normal
         *               capture fail       abnormal
         *   abnormal    host not live      abnormal
         *               capture fail       abnormal
         *               capture success    normal
         *               attempts run out   normal
         */

        while (true) {
            const ret = await RUN.handler({
                ...argv,
                telegram: state === 'normal' && argv.telegram,    // notify during normal capture
                daemon: true    // use daemon flag to prevent suicide on failure
            })

            if (state === 'normal') {
                if (!ret) {
                    state = 'normal'    // host is not live / capture success
                } else {
                    state = 'abnormal'    // capture failure
                    attemptCounter = argv.attempts
                }
            }

            if (state === 'abnormal') {
                attemptCounter -= 1
                if (attemptCounter === 0) {
                    state = 'normal'    // give up trying
                } else if (ret === 0) {
                    state = 'normal'    // capture success
                } else {
                    state = 'abnormal'   // host is not live, or capture fails
                }
            }

            const interval = state === 'normal' ? argv.interval
                           : state === 'abnormal' ? argv.abnormalInterval
                           : argv.interval
            await sleep(interval * 1000)
        }
    }
}