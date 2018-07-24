const { global: injectGlobalOptions, output: injectOutputOptions } = require('./_options')
const { parseRoom } = require('../lib/parser')
const { getRoomInfo, getRoomUser, getPlayUrls } = require('../lib/bili-api')
const { spawn } = require('child_process')
const { createWriteStream, resolvePath } = require('../lib/fs')
const expandTemplate = require('../lib/string-template')
const dateformat = require('dateformat')
const { resolve: resolveUrl } = require('url')
const { sendMessage } = require('../lib/telegram-api')

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
    })
}

module.exports = {
    yargs: yargs => injectOutputOptions(injectGlobalOptions(yargs))
        .usage('$0 run <room_id>')
        .positional('room_id', {
            describe: 'room id or live url',
            type: 'string'
        })
    ,

    /*
     * throw if bilibili API fails
     * return `undefined` if host is not live
     * return `0` if capture is successful (curl exits 0)
     * return non-zero (curl exit code) if capture fails (network / obs crash / etc)
     */
    handler: async argv => {
        const {
            outputDir,
            output,
            room_id,
            daemon = false,
            telegram = null,
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
            if (telegram) {
                const botApi = resolveUrl(argv.telegramEndpoint, `/bot${telegram.token}`)
                // telegram notification is asynchronous, do not block recording
                sendMessage(botApi, {
                    chat_id: telegram.chatId,
                    parse_mode: 'HTML',
                    text: `🌟hikaru: <a href="https://live.bilibili.com/${canonicalRoomId}">${name} (${canonicalRoomId})</a> 开始直播啦，快去让 TA 发光吧！`,
                    disable_notification: false,
                    disable_web_page_preview: true,
                }).then(
                    success => console.error(`✉️  Telegram 消息已投递`),
                    error => console.error(`✉️  Telegram 消息投递失败：${error.message}`)
                )
            }

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

            // return curl exit code, 0 for normal exit, non-0 for failure
            return code
        } catch(e) {
            console.error(e.stack)
        }
    }
}