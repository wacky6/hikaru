const {
    global: globalOpts,
    database: databaseOpts,
    subscribe: subscribeOpts,
    injectOptions
} = require('./_options')

const AmqpSubscriber = require('../lib/amqp-subscribe')
const parseDanmaku = require('../lib/providence-danmaku-parser')
const { MongoDump } = require('../lib/_mongo')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const dayjs = require('dayjs')
const toStatTime = date => {
    return dayjs(date).set('minute', 0).set('second', 0).set('ms', 0).toDate()
}

module.exports = {
    yargs: yargs => injectOptions(yargs, globalOpts, subscribeOpts, databaseOpts)

    ,

    handler: async argv => {
        process.on('SIGTERM', _ => process.exit(0))

        const {
            subscribeUrl,
            subscribeName,
            db
        } = argv

        const sub = new AmqpSubscriber(subscribeUrl, subscribeName)
        sub.connect()

        const dbConn = new MongoDump(db)
        await Promise.race([
            dbConn.connect(),
            sleep(5000)
        ]).then(
            ret => ret || console.error('mongo: connection not established yet, continue anyway.')
        )

        sub.on('message', async _msg => {
            const msg = JSON.parse(_msg)
            const parsed = parseDanmaku(msg)
            const time = new Date(msg._rxTime)

            if (!parsed) return

            const {
                uid,
                uname,
                action,
                gold = 0,
                silver = 0,
                ...rest
            } = parsed

            const id = {
                roomId: msg.roomId,
                uid: parsed.uid,
                time: toStatTime(time)
            }

            const updateOperator = (
                action === 'DANMAKU' ? {
                    $addToSet: { uname },
                    $inc: { danmaku: 1 },
                    $push: {
                        'danmakus': {
                            $each: [{ time, text: rest.text }],
                            $slice: -20000,    // limit maximum amount of danmakus kept in each log entry
                        },
                    },
                }
                : action === 'GIFT' ? {
                    $addToSet: { uname },
                    $inc: {
                        gold,
                        silver,
                        [`giftSum.${rest.giftName}.num`]: rest.giftNum
                    },
                    $set: { [`giftSum.${rest.giftName}.type`]: rest.coinType },
                    $max: { [`giftSum.${rest.giftName}.price`]: rest.price },
                    $push: {
                        gifts: {
                            $each: [{ time, name: rest.giftName, num: rest.giftNum }],
                            $slice: -20000,
                        }
                    }
                }
                : action === 'GUARD' ? {
                    $addToSet: { uname },
                    $inc: {
                        gold,
                        [`guardSum.${rest.guardName}.num`]: rest.guardNum
                    },
                    $set: { [`guardSum.${rest.guardName}.type`]: rest.coinType },
                    $max: { [`guardSum.${rest.guardName}.price`]: rest.price },
                    $push: {
                        guards: {
                            $each: [{ time, name: rest.guardName, num: rest.guardNum }],
                            $slice: -20000,
                        }
                    },
                }
                : null
            )

            if (!updateOperator) return

            let retryCount = 0

            const updateFn = _ => dbConn.getConn().then(
                conn => conn.db().collection('providence').updateOne(
                    { _id: id },
                    updateOperator,
                    { upsert: true },
                ).catch(err => {
                    if (err.code === 11000) {
                        // retry if we found duplicate key error
                        if (++retryCount > 10) {
                            console.error(`retry count exceeded: ${err.message}`)
                            return dbConn.errorHandler(err)
                        } else {
                            return sleep(100).then(updateFn)
                        }
                    } else {
                        console.error(err)
                        return dbConn.errorHandler(err)
                    }
                })
            )

            updateFn()
        })
    }
}