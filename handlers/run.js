const { global: injectGlobalOptions, output: injectOutputOptions } = require('./_options')
const { parseRoom } = require('../lib/parser')
const { getRoomInfo, getRoomUser, getPlayUrls } = require('../lib/bili-api')
const { spawn } = require('child_process')
const { createWriteStream, resolvePath, getFileSize } = require('../lib/fs')
const { unlink } = require('fs')
const expandTemplate = require('../lib/string-template')
const dateformat = require('dateformat')
const { resolve: resolveUrl } = require('url')
const { sendMessage, editMessageText } = require('../lib/telegram-api')

// used to catch empty stream caused by liveStatus update lag
// output files < this threshold is considered to be empty
const BLANK_STREAM_FILE_SIZE_THRESHOLD = 1024

async function downloadStream(url, outputPath) {
    const args = [
        '-L',    // follow redirect
        '-S',    // print error
        '-y',    // speed time, used to kill stagnated stream
        '10',    //     10s
        '-Y',    // speed limit, used to detect stagnated stream
        '10000', //     10 kB/s, estimated from basic audio stream bitrate (~128kbps -> 16kB/s)
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

async function sendNotification(tgOpts, messageArgs) {
    const {
        telegramEndpoint,
        telegram: {
            token,
            chatId
        } = {},
        silent,
    } = tgOpts || {}

    if (token && chatId) {
        const botApi = resolveUrl(telegramEndpoint, `/bot${token}`)

        try {
            const {
                messageId
            } = await sendMessage(botApi, {
                chat_id: chatId,
                disable_notification: silent,
                disable_web_page_preview: true,
                ...messageArgs
            })
            console.error(`✉️  Telegram 消息已投递`)

            return {
                editMessageText: args => editMessageText(botApi, {
                    chat_id: chatId,
                    message_id: messageId,
                    disable_notification: true,
                    disable_web_page_preview: true,
                    ...args
                }).then(
                    success => console.error(`✉️  Telegram 消息已更新`),
                    error => console.error(`✉️  Telegram 消息更新失败：${error.message}`)
                )
            }
        } catch(error) {
            console.error(`✉️  Telegram 消息投递失败：${error.message}`)
            return {
                editMessageText: Promise.resolve(null)
            }
        }
    } else {
        return {
            editMessageText: Promise.resolve(null)
        }
    }
}

function formatTimeDuration(secs) {
    const date = new Date(secs)
    return dateformat(date, 'UTC:HH:MM:ss')
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
     * throws if bili-api become ridiculous (changed)
     * return 0 if success
     * return non-zero if error
     */
    handler: async argv => {
        const {
            outputDir,
            output,
            room_id,
            telegramEndpoint,
            daemon = false,
            telegram = null,
            silent = false
        } = argv

        const telegramOpts = { telegramEndpoint, telegram, silent }

        try {
            // get idol information
            const inputRoomId = parseRoom(room_id)
            const {
                roomId: canonicalRoomId,
                liveStatus,
                liveStartsAt,
                title,
            } = await getRoomInfo(inputRoomId)
            const {
                name
            } = await getRoomUser(canonicalRoomId)

            if (liveStatus !== 1) {
                console.error(`⭐️  ${name} 不在直播 ${liveStatus}`)
                return 0
            }

            console.error(`⭐️  ${name} 直播中 ${liveStartsAt}`)

            // send message asynchronously, do not block
            const notificationPromise = sendNotification(telegramOpts, {
                parse_mode: 'HTML',
                text: `🌟hikaru: <a href="https://live.bilibili.com/${canonicalRoomId}">${name} (${canonicalRoomId})</a> 开始直播「${title}」啦，快去让 TA 发光吧！`,
            })

            // keep going until liveStatus changes to NOT_LIVE (1)
            // this is to deal with minor streaming disruptions (i.e. CDN network congestion)
            // NOTE: warn that template should contain a counter (i.e. time), or previous one will be overwritten
            const captureStartsAt = Date.now()

            while (true) {
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
                console.error(`    开始发光：${dateformat(new Date(), 'yyyy-mm-dd HH:MM:ss')}`)
                console.error(`    ${outputPath}`)
                console.error('')

                const code = await downloadStream(urls[0].url, outputPath)

                // nuke blank stream
                const fileSize = await getFileSize(outputPath)
                if (fileSize < BLANK_STREAM_FILE_SIZE_THRESHOLD) {
                    unlink(outputPath, err => err || console.error(`😈  删除空的视频流：${outputPath}`))
                }

                // blow self up if necessary, when curl fails
                if (!daemon && code) {
                    process.exit(code)
                }

                const {
                    liveStatus: postCaptureLiveStatus,
                    title: postCaptureTitle,
                } = await getRoomInfo(inputRoomId)

                if (postCaptureLiveStatus !== 1) {
                    console.error(`⭐️  ${name} 直播结束 ${liveStatus}`)

                    // compute statistics
                    const capturedDuration = Date.now() - captureStartsAt
                    // TODO: add stat about actual capture time, disruption count, etc.

                    // update telegram notification asynchronously, do not block
                    notificationPromise.then(notification => {
                        notification.editMessageText({
                            parse_mode: 'HTML',
                            text: `🌟hikaru: <a href="https://live.bilibili.com/${canonicalRoomId}">${name} (${canonicalRoomId})</a> 直播「${postCaptureTitle}」结束，已捕获 ${formatTimeDuration(capturedDuration)}。`,
                            disable_notification: true,
                            disable_web_page_preview: true,
                        })
                    })
                    return 0
                }
            }
        } catch(e) {
            console.error(e.stack)
            return 2
        }
    },

    // expose sendNotification method for testing
    sendNotification
}
