const { global: injectGlobalOptions, output: injectOutputOptions } = require('./_options')
const { parseRoom } = require('../lib/parser')
const { getRoomInfo, getRoomUser, getPlayUrls } = require('../lib/bili-api')
const { spawn } = require('child_process')
const { createWriteStream, resolvePath } = require('../lib/fs')
const expandTemplate = require('../lib/string-template')
const dateformat = require('dateformat')

async function downloadStream(url, outputPath) {
    const args = [
        '-L',    // follow redirect
        '-S',    // print error
        url,
    ]

    const stream = outputPath === '-' ? process.stdout : createWriteStream(outputPath)

    return new Promise(resolve => {
        const child = spawn('curl', args, stdio = ['ignore', 'pipe', 'pipe'])

        child.once('exit', (code) => {
            console.error('')
            console.error(`curl exits with: ${code}`)
            console.error('')
            resolve(code)
        })

        child.stdout.pipe(stream)
        child.stderr.pipe(process.stderr)

        // TODO: add email notification
    })
}

async function captureLive({
    outputPath,
    canonicalRoomId
}) {

}

module.exports = {
    yargs: yargs => injectOutputOptions(injectGlobalOptions(yargs))
        .usage('$0 run <room_id>')
        .positional('room_id', {
            describe: 'room id or live url',
            type: 'string'
        })
    ,
    handler: async argv => {
        const {
            outputDir,
            output,
            room_id,
            daemon = false
        } = argv

        try {
            // get idol information
            const inputRoomId = parseRoom(room_id)
            const {
                roomId: canonicalRoomId,
                liveStatus,
                liveStartsAt,
            } = await getRoomInfo(inputRoomId)
            const {
                name
            } = await getRoomUser(canonicalRoomId)

            if (liveStatus !== 1) {
                console.error(`⭐️  ${name} 不在直播 ${liveStatus}`)
                return
            }

            console.error(`⭐️  ${name} 直播中 ${liveStartsAt}`)

            const outputPath = output === '-'
                ? '-'
                : resolvePath(
                    outputDir,
                    expandTemplate(output, {
                        idol: name,
                        date: dateformat(new Date(), 'yyyy-mm-dd'),
                        time: Date.now(),
                        ext: 'flv',
                    })
                )

            const {
                quality,
                urls,
            } = await getPlayUrls(canonicalRoomId)

            if (urls.length === 0) {
                throw new Error('Stream list is empty')
            }

            console.error(`☑️  视频流捕获 Qual.${quality}：`)
            urls.forEach(entry => console.error(`    ${entry.url}`))

            console.error(`🌟  点亮爱豆……`)
            console.error(`    ${outputPath}`)
            console.error('')

            const code = await downloadStream(urls[0].url, outputPath)

            // blow self up if necessary
            if (!daemon && code) {
                process.exit(code)
            }
        } catch(e) {
            console.error(e.stack)
        }
    }
}