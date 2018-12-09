const {
    global: globalOpts,
    database: databaseOpts,
    subscribe: subscribeOpts,
    injectOptions
} = require('./_options')

const { MongoDump } = require('../lib/_mongo')
const AmqpSubscriber = require('../lib/amqp-subscribe')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// -> { uid, name, ... }
const parseMsg = msg => {
    switch(msg.cmd) {
        case 'DANMU_MSG':
            return {
                uid: msg.user.id,
                uname: msg.user.name,
                action: '弹幕',
                text: msg.text,
            }
        case 'SEND_GIFT':
            return {
                uid: msg.uid,
                uname: msg.uname,
                action: '礼物',
                gift: msg.giftName,
                num: msg.num,
                price: msg.price,
                coin: msg.coin_type,
            }
        case 'GUARD_BUY':
            return {
                uid: msg.uid,
                uname: msg.username,
                action: '上船',
                gift: msg.gift_name,
                num: msg.num,
                price: msg.price,
                coin: 'gold'
            }
    }
}

module.exports = {
    yargs: yargs => injectOptions(yargs, globalOpts, databaseOpts, subscribeOpts)
        .usage('$0 [room_id..]')
        .describe('gaze room for host statistics')
        .positional('room_id', {
            describe: 'canonical room_id, leave out to gaze all'
        })
    ,
        handler: async argv => {
            const {
                subscribeUrl,
                subscribeName,
                dump,
                db,
                room_id,
            } = argv

            const isGazing = async (canonicalRoomId) => room_id.length ? room_id.includes(canonicalRoomId) : true

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
                if (!isGazing(msg.roomId)) return

                const parsed = parseMsg(msg)
                if (!parsed) return

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

                const payload = {
                    roomId: msg.roomId,
                    time: new Date(msg._rxTime),
                    cmd: msg.cmd,
                    ...parsed,
                    ...(hostInfo ? {
                        hname: hostInfo.name,
                        hid: hostInfo.uid,
                    } : {})
                }

                await (dbConn && dbConn.getConn().then(
                    conn => conn.db().collection('gaze_host').insertOne(payload).catch(dbConn.errorHandler)
                ))
            })
        }
    ,

    async replayDanmaku(sourceDb, destinationDb) {
        const [src, dst] = await Promise.all([
            new MongoDump(sourceDb).getConn(),
            new MongoDump(destinationDb).getConn()
        ])

        let countUser = 0
        const cursorUser = src.db().collection('user').find({})
        while (await cursorUser.hasNext()) {
            const val = await cursorUser.next()

            await dst.db().collection('user').updateOne(
                { _id: val._id },
                { $set: val },
                { upsert: true }
            ).then(
                _ => {
                    countUser += 1
                    console.log(`${countUser} ${val.name}`)
                },
                err => console.error(err)
            )
        }
        await cursorUser.close()

        let countDanmaku = 0
        const cursorDanmaku = src.db().collection('danmaku').find({})
        const danmakuSize = await cursorDanmaku.count()

        while (await cursorDanmaku.hasNext()) {
            if (++countDanmaku % 100 === 0) {
                console.log(`\r${countDanmaku} / ${danmakuSize}`)
            }
            const msg = await cursorDanmaku.next()

            const parsed = parseMsg(msg)
            if (!parsed) {
                continue
            }

            // inject host info
            dst.db().collection('user').findOne(
                { roomId: msg.roomId },
                { name: 1, uid: 1 }
            ).then(hostInfo => {
                const payload = {
                    roomId: msg.roomId,
                    time: new Date(msg._rxTime),
                    cmd: msg.cmd,
                    ...parsed,
                    ...(hostInfo ? {
                        hname: hostInfo.name,
                        hid: hostInfo.uid,
                    } : {})
                }

                dst.db().collection('gaze_host').insertOne(payload).then(
                    _ => null,
                    err => {
                        console.error(err)
                    }
                )
            })
        }

        console.log(`\r${countDanmaku} / ${danmakuSize}`)
        await cursorDanmaku.close()
    }
}