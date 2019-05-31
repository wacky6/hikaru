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

function parseFracLike(str) {
    const vals = str.split(',')
    if (vals.length === 1) {
        const pct = parseFloat(vals[0], 10)
        if (Number.isNaN(pct) || pct >= 50) {
            throw new Error(`sum of crop percentage must < 100, given 2x${pct} = ${2*pct}`)
        }
        return [pct, pct]
    } else if (vals.length === 2) {
        const left = parseFloat(vals[0])
        const right = parseFloat(vals[1])
        if (left + right >= 100 || Number.isNaN(left) || Number.isNaN(right)) {
            throw new Error(`sum of crop percentage must < 100, given ${left} and ${right}`)
        }
        return [left, right]
    } else {
        throw new Error('At most two percentage can be specified, given ${vals.length}: ${str}')
    }
}

function wrapProgressIndicator(fn) {
    let colPos = 0
    return (...args) => {
        const maxCols = process.stdout.isTTY ? Math.max(1, process.stdout.columns - 1) : -1
        process.stderr.write('.')
        if (++colPos === maxCols) {
            process.stderr.write('\n')
            colPos = 0
        }
        return fn(...args)
    }
}

module.exports = {
    getDefaultOutputPath,
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
            alias: 'crop',
            describe: `amount to crop along the long axis (left-right, top-down),
 : improve detection for custom live stages
 : one or two percentage numbers,
 :   [v] -> cut [v]% off both sides
 :   [l],[r] -> cut [l]% off left and [r]% off right
 :   25,25 is equivlant to center crop`,
            default: '15,15',
            coerce: parseFracLike
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
            describe: `output path
 : "-" for stdout
 : default depends on input type
 :   for stdin -> stdout
 :   for file -> <filedir>/.pose/<filename>.<format>`
        })
        .option('p', {
            alias: 'progress',
            describe: 'print progress dot to stderr',
            type: 'boolean',
            default: false
        })
    ,
    handler: async argv => {
        const {
            input,
            noBudget,
            crop,
            multiplier,
            resolution,
            stride,
            format,
            output,
            progress
        } = argv

        const [ inputStream, outputStream ] = ensureInputAndOutputStream(input, output, format, noBudget)
        const handlePosesFn = format === 'csv' ? createCsvHandler(outputStream)
                            : format === 'ndjson' ? createNdjsonHandler(outputStream)
                            : () => null

        console.error(`
starting posenet:
    multiplier: ${multiplier}
          crop: ${crop.join(', ')}
    resolution: ${resolution}
        stride: ${stride}
        output: ${outputStream === process.stdout ? 'stdout' : outputStream.path}
`)

        const frameHandler = progress ? wrapProgressIndicator(handlePosesFn) : handlePosesFn

        const {
            skippedFrames
        } = await processStream(inputStream, multiplier, crop, resolution, stride, frameHandler)

        // if progress is enabled, terminate progression dots
        if (progress) {
            process.stderr.write('\n')
        }

        if (skippedFrames) {
            console.error(`analyze complete. ${skippedFrames} frames were skipped.`)
        } else {
            console.error(`analyze complete.`)
        }
    }
}
