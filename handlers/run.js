const { global: injectGlobalOptions, output: injectOutputOptions } = require('./_options')
const { parseRoom } = require('../lib/parser')
const { readConfig, writeConfig } = require('../lib/config')
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

    const stream = createWriteStream(outputPath)

    return new Promise(resolve => {
        const child = spawn('curl', args, stdio = ['ignore', 'pipe', 'pipe'])

        child.once('exit', (code) => {
            console.log(`curl exits with: ${code}`)
            resolve(code)
        })

        child.stdout.pipe(stream)
        child.stderr.pipe(process.stdout)

        // TODO: add a progress / bandwidth indicator
        // TODO: add email notification
    })
}

async function captureLive({
    outputPath,
    canonicalRoomId
}) {
    const {
        quality,
        urls,
    } = await getPlayUrls(canonicalRoomId)

    if (urls.length === 0) {
        throw new Error('Stream list is empty')
    }

    console.log(`☑️  视频流捕获 Qual.${quality}：`)
    urls.forEach(entry => console.log(`    ${entry.url}`))

    console.log(`🌟  点亮爱豆……`)
    console.log(`    ${outputPath}`)
    console.log('')
    await downloadStream(urls[0].url, outputPath)
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
            outputDir: _output_dir,
            output: _output,
            config: _config,
            room_id
        } = argv

        const config = await readConfig(_config)

        // build args
        const outputDir = _output_dir || config.output_dir
        const output = _output || config.output

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
                console.log(`⭐️  ${name} 不在直播 ${liveStatus}`)
                return
            }

            console.log(`⭐️  ${name} 直播中 ${liveStartsAt}`)

            const outputPath = resolvePath(
                outputDir,
                expandTemplate(output, {
                    idol: name,
                    date: dateformat(new Date(), 'yyyy-mm-dd'),
                    time: Date.now(),
                    ext: 'flv',
                })
            )

            await captureLive({
                outputPath,
                canonicalRoomId,
            })
        } catch(e) {
            console.error(e.stack)
        }
    }
}