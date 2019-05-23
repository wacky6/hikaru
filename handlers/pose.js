const CONV_MUL_SELECTIONS = [0.5, 0.75, 1.0, 1.01]
const STRIDE_SELECTIONS = [8, 16, 32]
const NET_RESOLUTION_SELECTIONS = [193, 257, 353, 449, 513]    // part of all available options
const OUTPUT_FORMAT_SELECTIONS = ['csv', 'ndjson']

const mkdirp = require('mkdirp')
const fs = require('fs')
const {dirname, basename, extname, resolve, join} = require('path')
const {processStream, createCsvHandler, createNdjsonHandler } = require('../posenet')

function getDefaultOutputPath(inputPath, format = 'ndjson') {
    if (inputPath === '-' || inputPath === '') {    // hack for yargs's option dash parsing
        return '-'
    } else {
        const fullpath = resolve(process.cwd(), inputPath)
        const filename =  basename(inputPath, extname(inputPath)) + '.' + format.toLowerCase()
        return join(dirname(fullpath), '.pose/', filename)
    }
}

function ensureInputAndOutputStream(inputSpec, outputSpec, format = 'ndjson', disableBudget = false) {
    const inputStream = inputSpec === '-' || inputSpec === '' ? process.stdin : fs.createReadStream(inputSpec)
    if (disableBudget && inputStream === process.stdin) {
        inputStream.path = 'pipe:stdin'
    }
    const outputPath = outputSpec ? outputSpec : getDefaultOutputPath(inputSpec, format)
    if (outputPath !== '-') {
        mkdirp.sync(dirname(outputPath))
    }
    const outputStream = outputPath === '-' ? process.stdout : fs.createWriteStream(outputPath)
    return [inputStream, outputStream]
}

module.exports = {
    yargs: yargs => yargs
        .usage('$0 pose <input> [options]')
        .positional('input', {
            describe: 'input media file, use - for stdin',
            type: 'string'
        })
        .option('B', {
            alias: 'no-budget',
            describe: "disable stream budgeting for stdin \n : will stall upstream if posenet can't keep up",
            default: false,
            type: 'boolean'
        })
        .option('c', {
            alias: 'center-crop',
            describe: 'only analyze center square region \n : improve speed for hosts without custom stages',
            type: 'boolean',
            default: false
        })
        .option('m', {
            alias: 'multiplier',
            describe: 'posenet convolution multiplier \n : high for accuracy, low for speed\n',
            type: 'number',
            default: 0.75,
            choices: CONV_MUL_SELECTIONS
        })
        .option('r', {
            alias: 'resolution',
            describe: 'posenet resolution \n : high for accuracy, low for speed',
            type: 'number',
            default: 353,
            choices: NET_RESOLUTION_SELECTIONS,
        })
        .option('s', {
            alias: 'stride',
            describe: 'posenet output stride \n : low for accuracy, high for speed',
            type: 'number',
            default: 16,
            choices: STRIDE_SELECTIONS
        })
        .option('f', {
            alias: 'format',
            describe: `output format \n : csv dumps the most prominent pose, \n : ndjson dumps all predictions`,
            type: 'string',
            default: 'csv',
            choices: OUTPUT_FORMAT_SELECTIONS
        })
        .option('o', {
            alias: 'output',
            describe: 'output path \n : "-" for stdout\n : default depends on input type\n :   for stdin -> stdout \n :   for file -> <filedir>/.pose/<filename>.<format>\n'
        })
    ,
    handler: async argv => {
        const {
            input,
            noBudget,
            centerCrop,
            multiplier,
            resolution,
            stride,
            format,
            output
        } = argv

        const [ inputStream, outputStream ] = ensureInputAndOutputStream(input, output, format, noBudget)
        const handlePosesFn = format === 'csv' ? createCsvHandler(outputStream)
                            : format === 'ndjson' ? createNdjsonHandler(outputStream)
                            : () => null

        console.error(`
starting posenet:
     multiplier: ${multiplier}
    center-crop: ${centerCrop}
     resolution: ${resolution}
         stride: ${stride}
         output: ${outputStream === process.stdout ? 'stdout' : outputStream.path}
`)

        const {
            skippedFrames
        } = await processStream(inputStream, multiplier, centerCrop, resolution, stride, handlePosesFn)


        if (skippedFrames) {
            console.error(`done. ${skippedFrames} frames were skipped.`)
        } else {
            console.error(`done.`)
        }
    }
}