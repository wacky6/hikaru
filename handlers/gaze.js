const {
    global: globalOpts,
    telegram: telegramOpts,
    database: databaseOpts,
    injectOptions
} = require('./_options')

const { defaultEndpoint, defaultExchangeName } = require('../lib/_amqp')
const { MongoDump } = require('../lib/_mongo')
const AmqpSubscriber = require('../lib/amqp-subscribe')
const stringWidth = require('string-width')

const safePad = (s, width = 30) => {
    const w = stringWidth(s)
    return s + ' '.repeat(Math.max(0, width - w))
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const transformGuardLevel = val => {
    if (val === 3) return '舰长'
    if (val === 2) return '提督'
    if (val === 1) return '总督'
    return `未知${val}`
}

// -> { uid, name, ... }
const parseMsg = msg => {
    switch(msg.cmd) {
        case 'DANMU_MSG':
            return {
                uid: msg.user.id,
                name: msg.user.name,
                action: '弹幕',
                note: msg.text,
            }
        case 'SEND_GIFT':
            return {
                uid: msg.uid,
                name: msg.uname,
                action: '礼物',
                note: `${msg.giftName} x ${msg.num}`
            }
        case 'WELCOME':
            return {
                uid: msg.uid,
                name: msg.uname,
                action: `入场 ${msg.svip ? '年费': ''}老爷`,
                note: ''
            }
        case 'WELCOME_GUARD':
            return {
                uid: msg.uid,
                name: msg.username,
                action: `入场 ${transformGuardLevel(msg.guard_level)}`,
                note: ''
            }
        case 'GUARD_BUY':
            return {
                uid: msg.uid,
                name: msg.username,
                action: `上船 ${msg.gift_name}`,
                note: msg.num > 1 ? `x ${msg.num}` : ''
            }
        case 'ENTRY_EFFECT':    // ignored, should duplicate with WELCOME_GUARD
    }
}

module.exports = {
    yargs: yargs => injectOptions(yargs, globalOpts, telegramOpts, databaseOpts)
        .usage('$0 <uid|user..>')
        .positional('uid|user', {
            describe: 'user id, user name fragment; user "" (empty string) to catch all'
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
        .option('r', {
            alias: 'room',
            type: 'number',
            describe: 'monitor activity in room, must be canonical room id'
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

            subscriber.on('message', async msg => {
                msg = JSON.parse(msg)
                const parsed = parseMsg(msg)

                if (!parsed) return

                let {
                    uid,
                    uname,
                    action,
                    note,
                } = parsed

                // check if we are observing
                const isObserving = (
                    ((room && room === msg.roomId) || (!room))
                    &&
                    (uids.includes(uid) || userNames.findIndex(nameToFind => uname.includes(nameToFind)) >= 0 )
                )
                if (!isObserving) return

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
                    ).catch(_ => dbConn.errorHandler)
                ))
            })
        }
}