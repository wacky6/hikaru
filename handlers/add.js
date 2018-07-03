const { global: injectGlobalOptions } = require('./_options')
const { parseRoom } = require('../lib/parser')
const { readConfig, writeConfig } = require('../lib/config')
const { getRoomInfo, getRoomUser } = require('../lib/bili-api')
const { arrayUpdate } = require('../lib/array-util')

module.exports = {
    yargs: yargs => injectGlobalOptions(yargs)
        .usage('$0 add <room_id>')
        .positional('room_id', {
            describe: 'room id or live url',
            type: 'string'
        })
    ,
    handler: async argv => {
        const {
            config: _config,
            room_id
        } = argv

        try {
            // get idol information
            const inputRoomId = parseRoom(room_id)
            const {
                roomId: canonicalRoomId,
                title
            } = await getRoomInfo(inputRoomId)
            const {
                name,
                uid,
            } = await getRoomUser(canonicalRoomId)
            console.log(`⭐️  捕获爱豆 ${name} (${uid}) / ${title} (${canonicalRoomId})`)

            // TODO: ask for confirmation

            // write to crontab configuration
            const config = await readConfig(_config)
            const newConfig = {
                ...config,
                idols: arrayUpdate(
                    config.idols,
                    entry => entry.uid === uid,
                    {
                        uid,
                        canonicalRoomId,
                        title,
                        uname: name,
                    }
                )
            }

            await writeConfig(_config, newConfig)
            console.log(`✨  ${name} 已加入列表`)
        } catch(e) {
            console.error(e.stack)
        }
    }
}