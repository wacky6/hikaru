/*
 * danmaku parser
 * -> {
 *   uid
 *   uname
 *   action = enum{ DANMAKU, GIFT, GUARD }
 *   ... optionalFields
 * }
 *
 * optionalFields = {
 *   gold         // total goid coin income
 *   silver       // total silver coin income
 *   giftName     // gift name
 *   giftNum      // number of gift
 *   guardName    // guard level name
 *   guardNum     // number of guard buy
 *   text         // danmaku text
 *   coinType     // coin type = enum{ gold, silver }
 *   price        // gift / guard price
 * }
 *
 */

module.exports = function parseDanmaku(msg) {
    switch(msg.cmd) {
        case 'DANMU_MSG':
            return {
                uid: msg.user.id,
                uname: msg.user.name,
                action: 'DANMAKU',
                text: msg.text,
            }
        case 'SEND_GIFT':
            return {
                uid: msg.uid,
                uname: msg.uname,
                action: 'GIFT',
                [msg.coin_type]: msg.num * msg.price,
                giftName: msg.giftName,
                giftNum: msg.num,
                coinType: msg.coin_type,
                price: msg.price,
            }
        case 'GUARD_BUY':
            return {
                uid: msg.uid,
                uname: msg.username,
                action: 'GUARD',
                gold: msg.num * msg.price,
                guardName: msg.gift_name,
                guardNum: msg.num,
                coinType: "gold",
                price: msg.price
            }
    }
}