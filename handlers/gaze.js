const {
    global: globalOpts,
    telegram: telegramOpts,
    database: databaseOpts,
    subscribe: subscribeOpts,
    injectOptions
} = require('./_options')

const { MongoDump } = require('../lib/_mongo')
const AmqpSubscriber = require('../lib/amqp-subscribe')
const stringWidth = require('string-width')
const { guardLevel } = require('../lib/to-text')

const safePad = (s, width = 30) => {
    const w = stringWidth(s)
    return s + ' '.repeat(Math.max(0, width - w))
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// -> { uid, name, ... }
const parseMsg = msg => {
    switch(msg.cmd) {
        case 'DANMU_MSG':
            return {
                uid: msg.user.id,
                uname: msg.user.name,
                action: '弹幕',
                note: msg.text,
            }
        case 'SEND_GIFT':
            return {
                uid: msg.uid,
                uname: msg.uname,
                action: '礼物',
                note: `${msg.giftName} x ${msg.num}`
            }
        case 'WELCOME':
            return {
                uid: msg.uid,
                uname: msg.uname,
                action: `入场 ${msg.svip ? '年费': ''}老爷`,
                note: ''
            }
        case 'WELCOME_GUARD':
            return {
                uid: msg.uid,
                uname: msg.username,
                action: `入场 ${guardLevel(msg.guard_level)}`,
                note: ''
            }
        case 'GUARD_BUY':
            return {
                uid: msg.uid,
                uname: msg.username,
                action: `上船 ${msg.gift_name}`,
                note: msg.num > 1 ? `x ${msg.num}` : ''
            }
        case 'ENTRY_EFFECT':    // ignored, should duplicate with WELCOME_GUARD
    }
}

module.exports = {
    yargs: yargs => injectOptions(yargs, globalOpts, telegramOpts, databaseOpts, subscribeOpts)
        .usage('$0 <uid|user..>')
        .positional('uid|user', {
            describe: 'user id, user name fragment; user "" (empty string) to catch all'
        })
        .option('r', {
            alias: 'room',
            type: 'number',
            describe: 'monitor activity in room, must be canonical room id'
        })
        .option('d', {
            alias: 'dump',
            type: 'boolean',
            describe: 'dump danmaku to database, see --db',
            default: false
        })
    ,
        handler: async argv => {
            const {
                telegramEndpoint,
                telegram = null,
                subscribeUrl,
                subscribeName,
                dump,
                db,
                user,
                room,
            } = argv

            const {
                token,
                chatId
            } = telegram || {}

            const userNames = user.filter($ => typeof $ === 'string')
            const uids = user.filter($ => typeof $ === 'number')

            const subscriber = new AmqpSubscriber(subscribeUrl, subscribeName)
            subscriber.connect()

            const dbConn = dump && new MongoDump(db)
            if (dbConn) {
                await Promise.race([
                    dbConn.connect(),
                    sleep(5000)
                ]).then(
                    ret => ret || console.error('mongo: connection not established yet, continue anyway.')
                )
            }

            subscriber.on('message', async _msg => {
                const msg = JSON.parse(_msg)
                const parsed = parseMsg(msg)

                if (!parsed) return

                let {
                    uid,
                    uname,
                    action,
                    note,
                } = parsed

                // check if we are observing
                try {
                    const isObserving = (
                        ((room && room === msg.roomId) || (!room))
                        &&
                        (uids.includes(uid) || userNames.findIndex(nameToFind => uname.includes(nameToFind)) >= 0 )
                    )
                    if (!isObserving) return
                } catch(e) {
                    console.error('caught observing check fail:')
                    console.error(`parsed = ${JSON.stringify(parsed)}`)
                    console.error(`source = ${JSON.stringify(msg)}`)
                    return
                }

                // inject host info
                const hostInfo = await (dbConn && dbConn.getConn().then(
                    conn => conn.db().collection('user').findOne(
                        { roomId: msg.roomId },
                        { name: 1, uid: 1 }
                    ).catch(err => {
                        dbConn.errorHandler(err)
                        return null
                    }).then(
                        resp => resp,
                    )
                ))

                const lastAction = {
                    roomId: msg.roomId,
                    action,
                    note,
                    ...(hostInfo ? {
                        hostName: hostInfo.name,
                        hostUid: hostInfo.uid,
                    } : {})
                }

                const userStr = safePad(`${uname}`, 30)
                const hostStr = safePad(`${lastAction.hostName || msg.roomId}`, 30)
                const actionStr = safePad(`${action}`, 16)
                console.log(`${userStr}\t${hostStr}\t${actionStr}\t${note}`)

                await (dbConn && dbConn.getConn().then(
                    conn => conn.db().collection('gaze').updateOne(
                        { _id: uid },
                        { $set: {
                            _id: uid,
                            uid,
                            name: uname,
                            ...lastAction,
                        },
                        $push: {
                            'log': {
                            $each: [lastAction],
                            $position: 0,
                            $slice: 10
                            },
                        },
                        $currentDate: { _lastModified: true },
                        },
                        { upsert: true }
                    ).catch(dbConn.errorHandler)
                ))
            })
        }
}