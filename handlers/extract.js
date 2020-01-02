const fs = require('fs')
const os = require('os')
const {dirname, basename, extname, resolve, join} = require('path')
const mktemp = require('mktemp')
const {resolvePath, ensureDir, getOutputPath, createWriteStream} = require('../lib/fs')
const expandTemplate = require('../lib/string-template')
const {spawn} = require('child_process')
const dateformat = require('dateformat')

const ANALYZERS = require('./_analyzers')
/*
 * ANALYZERS is mapping from extraction type to actual analyze/segment backends
 *
 * Each backend supports the following methods:
 *   analyzeStream(mediaStream, argStr) => { resultStream, errorStream, onFinish (Promise) }
 *   analyzeFile(mediaPath, argStr) => { resultStream, errorStream, onFinish (Promise) }
 *   segmentFile(analyzeResultPath, argStr, verboseBasepath) => Promise:
 *       resolves to { segments: [startTime, endTime], allOk: boolean }, or rejects with an error
 *       verboseBasepath: if provided, save segmentation analysis
 *                        should not contain extname, segmentation tool will append it
 *                        (analyzer may not support this)
 *
 *   getDefaultAnalyzeResultPath(mediaPath) => path to analyze result, or null
 */

const fileExists = path => new Promise(resolve => fs.access(path, fs.constants.F_OK, (err) => resolve(!err)))
const toTimeRepr = sec => {
    const pad2 = v => String(v).padStart(2, '0')
    const h = Math.floor(sec / 3600)
    const m = Math.floor(sec / 60) % 60
    const s = Math.floor(sec % 60)
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}
const toDurationSpec = sec => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m} min ${s} sec`
}

// predictSegmentWallClockFileName(inputPath, segmentStartTimeInSeconds)
//   return wall-clock segment file name;
//   return `null` if can not find date-time in inputPath.
function predictSegmentWallClockFileName(inputPath, segmentStartTimeInSeconds) {
    if (segmentStartTimeInSeconds < 0) {
        return null
    }

    // should process all previously known default output filenames:
    // earliest default (pre-2019): [idol]_[YYYY-MM-DD]_[JS Timestamp]
    const reDashDateTimestamp = /(\d{4}-\d{2}-\d{2}).(\d{10,16})/
    // second default (early 2019 - mid 2019): [idol]_[YYYY-MM-DD]_[hh-mm-ss]
    const reDashDateDashTime = /(\d{4}-\d{2}-\d{2}).(\d{2}-\d{2}-\d{2})/
    // current default (since mid 2019): [idol]_[YYYY-MM-DD]_[hhmmss]
    const reDashDateTime = /(\d{4}-\d{2}-\d{2}).(\d{6})/

    const inputBasename = basename(inputPath, extname(inputPath))

    let match, refDateTime, replaceRegExp
    if (match = reDashDateTimestamp.exec(inputBasename)) {
        const timestamp = match[2]
        refDateTime = new Date(parseInt(timestamp, 10))
        replaceRegExp = reDashDateTimestamp
    } else if (match = reDashDateDashTime.exec(inputBasename)) {
        const [YYYY, MM, DD] = match[1].split('-').map(str => parseInt(str, 10))
        const [hh, mm, ss] = match[2].split('-').map(str => parseInt(str, 10))
        // check YYYY-MM-DD hh-mm-ss is reasonable
        if ( 1 <= MM && MM <= 12
          && 1 <= DD && DD <= 31
          && 0 <= hh && hh <= 24
          && 0 <= mm && mm <= 60
          && 0 <= ss && ss <= 60
        ) {
            refDateTime = new Date(YYYY, MM-1, DD, hh, mm, ss, 0)
            replaceRegExp = reDashDateDashTime
        }
    } else if (match = reDashDateTime.exec(inputBasename)) {
        const [YYYY, MM, DD] = match[1].split('-').map(str => parseInt(str, 10))
        const [hh, mm, ss] = match[2].match(/\d{2}/g).map(str => parseInt(str, 10))
        if ( 1 <= MM && MM <= 12
          && 1 <= DD && DD <= 31
          && 0 <= hh && hh <= 24
          && 0 <= mm && mm <= 60
          && 0 <= ss && ss <= 60
        ) {
            refDateTime = new Date(YYYY, MM-1, DD, hh, mm, ss, 0)
            replaceRegExp = reDashDateTime
        }
    } else {
        // filename does not match any defaults
        return null
    }

    // check refDateTime is truthy, and not invalid (NaN)
    if (!refDateTime || refDateTime.valueOf() !== refDateTime.valueOf()) {
        return null
    }

    const segmentStartTime = new Date(refDateTime.valueOf() + Math.max(1, segmentStartTimeInSeconds) * 1000)
    const segmentStartTimeStr = dateformat(segmentStartTime, 'yyyy-mm-dd_HHMMss')
    return inputBasename.replace(replaceRegExp, segmentStartTimeStr)
}

// return Promise -> analyzerResultPath
async function ensureAnalyzerResult({
    stream = null,
    mediaPath,
    analyzerResultSpec,
    type,
    fresh = false,
    analyzerArgs = '',
    persistResult = false
}) {
    const {
        analyzeStream,
        analyzeFile,
        getDefaultAnalyzeResultPath,
    } = ANALYZERS[type]

    // if analyzerResult exists, reuse it
    const analyzerResultPathToProbe = analyzerResultSpec ? analyzerResultSpec : getDefaultAnalyzeResultPath(mediaPath)
    const analyzerResultExists = !fresh && analyzerResultPathToProbe && await fileExists(analyzerResultPathToProbe)
    if (analyzerResultExists) {
        console.error(`Reuse analyze result: ${analyzerResultPathToProbe}`)
        return analyzerResultPathToProbe
    }

    // otherwise, run analysis process
    const analyzerResultPath = persistResult
        ? typeof persistResult === 'string'
          ? persistResult
          : getDefaultAnalyzeResultPath(mediaPath)
        : await mktemp.createFile(join(os.tmpdir(), `hikaru-analyze-${type}-XXXXX`))

    if (persistResult) {
        console.error(`Perform fresh analyze, save to ${analyzerResultPath} :`)
    } else {
        console.error(`Perform fresh analyze: ${analyzerResultPath}`)
    }

    const analyzerResultStream = createWriteStream(analyzerResultPath)
    const {
        resultStream,
        errorStream,
        onFinish,
        _childProcess
    } = stream ? analyzeStream(stream, analyzerArgs) : analyzeFile(mediaPath, analyzerArgs)

    resultStream.pipe(analyzerResultStream)
    errorStream.pipe(process.stderr)

    // trap early termination / exit
    // and cleanup partial result
    const cleanupPartialResult = () => {
        _childProcess && _childProcess.kill('SIGKILL')
        resultStream.destroy()
        fs.unlinkSync(analyzerResultPath)
        process.off('SIGTERM', cleanupPartialResult)
        process.off('SIGINT', cleanupPartialResult)
        process.off('exit', cleanupPartialResult)
        process.exit(1)
    }

    process.on('exit', cleanupPartialResult)
    process.on('SIGINT', cleanupPartialResult)
    process.on('SIGTERM', cleanupPartialResult)

    const analyzerExitCode = await onFinish

    process.off('SIGTERM', cleanupPartialResult)
    process.off('SIGINT', cleanupPartialResult)
    process.off('exit', cleanupPartialResult)

    return analyzerExitCode === 0 ? analyzerResultPath : null
}

// return ffmpeg exit code
// TODO: fiddle with ffmpeg timestamp / pts / dts handling
//       posenet analysis can produce reasonable pts even there is incorrect pts
//       but during extraction, ffmpeg's pts calculation differs from our corrected version
//       so it will not produce the desired segment
async function extractMediaSegmentTo(media, start, end, format, outputPath) {
    const ffmpegFormat = ({
        'mp4': 'mp4',
        'mkv': 'matroska'
    })[format]
    return new Promise(resolve => {
        const args = [
            '-hide_banner',
            '-ss',
            Number(start).toFixed(3),
            '-i',
            media,
            '-to',
            Number(end - start).toFixed(3),
            '-c',
            'copy',
            '-format',
            ffmpegFormat,
            '-y',
            outputPath,
        ]
        const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] })
        child.once('exit', (code) => { resolve(code) })
    })
}

function mediaSpecIsStdin(media) {
    return media === '-' || media === ''
}

module.exports = {
    predictSegmentWallClockFileName,
    ANALYSIS_BACKENDS: ANALYZERS,
    yargs: yargs => yargs
        .usage('$0 pose <media> [options]')
        .positional('media', {
            describe: 'media file to extract, use - for stdin',
            type: 'string'
        })
        .option('t', {
            alias: 'type',
            describe: 'type of extraction to perform',
            choices: Object.keys(ANALYZERS),
            default: 'dance'
        })
        .option('a', {
            alias: 'analyzer-result',
            describe: `path to analyzer result
 : skip analysis phase and use the provided result
 : if not provided, probe analyzer's default`
        })
        .option('A', {
            alias: 'analyzer-args',
            describe: `additional args for analyzer
 : ignored when -a / --analyzer-result is valid`,
            type: 'string',
            nargs: 1,
            default: ''
        })
        .option('p', {
            alias: 'persist-result',
            describe: `persist (save) analyzer result
 : optionally, take a path as argument
 : if path is not provided, save to analyzer default
 : ignored when -a / --analyzer-result is valid`
        })
        .option('d', {
            alias: 'dump-segmentation',
            describe: `dump segmentation analysis
 : optionally, take a basepath as argument
 : do not include file extension name
 : segmenter will add appropriate extension
 : basepath defaults to @outdir/@base
 : supports @var template,
 : @outdir  -> output dir (--output-dir argument)
 : @base    -> media's base name (without extension)`,
        })
        .option('S', {
            alias: 'segmentation-args',
            describe: `additional args for segmenration tool`,
            type: 'string',
            nargs: 1,
            default: null
        })
        .option('O', {
            alias: 'output-dir',
            describe: `output directory pattern, supports @var template
 : @basedir  -> media's basedir`,
            type: 'string',
            default: '@basedir/extracted/',
        })
        .option('o', {
            alias: 'output',
            describe: `output file pattern, supports @var template
 : @auto     -> intelligent wall-clock name:
 :              replace date-time in input path to the
 :              wall clock when the segment starts.
 : @base     -> media's base name (without extension)
 : @seq      -> segment sequence number
 : @ext      -> output format extension name`,
            default: '@auto.@ext'
        })
        .option('f', {
            alias: 'format',
            describe: 'output container format',
            choices: ['mp4', 'mkv'],
            default: 'mp4'
        })
        .option('F', {
            alias: 'fresh',
            describe: 'perform fresh analysis, implied when media is stdin',
            type: 'boolean',
            default: false
        })
        .option('R', {
            alias: 'ref-path',
            describe: 'reference path when media is stdin',
            type: 'string',
        })
    ,
    handler: async argv => {
        const {
            media,
            type,
            fresh,
            analyzerResult,
            analyzerArgs,
            persistResult,
            segmentationArgs,
            dumpSegmentation,
            outputDir: _outputDir,
            output,
            format,
            refPath,
        } = argv

        // if media is stdin, refPath must be provided
        if (mediaSpecIsStdin(media) && !refPath) {
            console.error(`when using stdin as media, --ref-path must be provided.`)
            process.exit(1)
        }

        const mediaPath = mediaSpecIsStdin(media) ? refPath : media
        const outputDir = resolvePath(expandTemplate(_outputDir, { basedir: dirname(resolve(process.cwd(), mediaPath)) }))

        const analyzeResultPath = await ensureAnalyzerResult({
            stream: mediaSpecIsStdin(media) ? process.stdin : null,
            mediaPath,
            analyzerResultSpec: analyzerResult,
            type,
            fresh: mediaSpecIsStdin(media) ? true : fresh,
            analyzerArgs,
            persistResult,
        })

        if (!analyzeResultPath) {
            console.error(`\nAnalyzer failed, will not extract.`)
            process.exit(1)
        }

        const mediaBase = basename(mediaPath, extname(mediaPath))

        const verboseBasepath = (
            dumpSegmentation
                ? getOutputPath(
                    typeof dumpSegmentation === 'string' ? dumpSegmentation : '@outdir/@base',
                    '.',
                    {
                        outdir: outputDir,
                        base: mediaBase
                    }
                )
                : false
        )

        const { segments } = await ANALYZERS[type].segmentFile(analyzeResultPath, segmentationArgs, verboseBasepath)

        console.error(`Found ${segments.length} segments.`)
        for (let seq=1 ; seq<=segments.length; seq++) {
            const [start, end] = segments[seq-1]

            console.error(`Extracting segment ${seq}:`)
            console.error(`  start:  ${toTimeRepr(start)}`)
            console.error(`  to:     ${toTimeRepr(end)}`)
            console.error(`  dur:    ${toDurationSpec(end-start)}`)

            const outputPath = getOutputPath(output, outputDir, {
                auto: predictSegmentWallClockFileName(mediaBase, start) || `${mediaBase}_${seq}`,
                base: mediaBase,
                seq,
                ext: format
            })
            if (outputPath === '-') {
                console.error(`  <!> does not work with stdout, terminating`)
                process.exit(2)
                break
            }

            ensureDir(outputPath)
            console.error(`  dest:   ${outputPath}`)

            const code = await extractMediaSegmentTo(mediaPath, start, end, format, outputPath)
            if (code === 0) {
                console.log(`  -> ok`)
            } else {
                console.log(`  -> not ok, ffmpeg exits with ${code}`)
            }
        }

        console.error(`Extraction complete.`)
    }
}