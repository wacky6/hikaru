const { createCanvas, createImageData } = require('canvas')
const beamcoder = require('beamcoder')
const { load: loadPoseNet } = require('./model')
const { createBudgetForStream, isRealtimeStream } = require('../lib/stream-budget')

/* <DONE>, see posenet/posenet_local
 * posenet dist needs patch, in order to:
 *   use `@tensorflow/tfjs-node`, for better performance (~2x speedup)
 *   use local network bundle, avoid google storage apis network fetch
 */

/* <DONE>, use git@github.com:wacky6/Beamcoder
 * Beamcoder dist needs patch, in order to:
 *   remove the annoying splash in index.js, because it prints to stdout
 */

const PARTS = [
    'nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
    'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
    'leftWrist', 'rightWrist', 'leftHip', 'rightHip',
    'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'
]

const getBoundingBox = (detection) => {
    const numCmp = (a,b) => a-b
    const kpaX = detection.keypoints.map($ => $.position.x).sort(numCmp)
    const kpaY = detection.keypoints.map($ => $.position.y).sort(numCmp)
    const aL = Math.min(...kpaX)
    const aR = Math.max(...kpaX)
    const aT = Math.min(...kpaY)
    const aB = Math.max(...kpaY)
    return {
        left: aL,
        right: aR,
        top: aT,
        bottom: aB,
        size: (aB - aT) * (aR - aL),
        centerX: (aL + aR) / 2,
        centerY: (aT + aB) / 2,
    }
}

const compareByBoundingBoxSize = (a, b) => {
    const boundingA = getBoundingBox(a)
    const boundingB = getBoundingBox(b)
    return boundingB.size - boundingA.size
}

function createCsvHandler(stream = process.stdout) {
    // print csv header
    const partsHeader = PARTS
        .map(partName => [partName, partName+'X', partName+'Y'])
        .reduce((ret, arr) => [...ret, ...arr], [])
        stream.write(`pts,${partsHeader}\n`)

    return async function csvPoseHandler(poses, rgbFrame, pts) {
        const picked = poses.sort(compareByBoundingBoxSize)[0]
        if (!picked) return

        const partLine = picked.keypoints
            .map(kp => [kp.score, kp.position.x, kp.position.y].map(float => float.toFixed(2)))
            .reduce((ret, arr) => [...ret, ...arr], [])

        stream.write(`${pts.toFixed(3)},${partLine}\n`)
    }
}

function createNdjsonHandler(stream = process.stdout) {
    return async function(poses, rgbFrame, pts) {
        const out = {
            pts,
            poses
        }
        stream.write(JSON.stringify(out))
        stream.write('\n')
    }
}

// return width, height, startX, startY for given crop spec
function computeAnalysisRegion(width, height, cropSpec = [15, 15]) {
    if (width > height) {
        const cropLeft = Math.round(cropSpec[0] / 100 * width)
        const cropRight = Math.round(cropSpec[1] / 100 * width)
        return [width - cropLeft - cropRight, height, cropLeft, 0]
    } else if (width < height) {
        const cropTop = Math.round(cropSpec[0] / 100 * height)
        const cropBottom = Math.round(cropSpec[1] / 100 * bottom)
        return [width, height - cropHeight - cropBottom, 0, cropTop]
    } else {
        return [width, height, 0, 0]
    }
}

const restoreUncroppedCoordinate = (poses, cX, cY) => {
    return poses.map(pose => ({
        score: pose.score,
        keypoints: pose.keypoints.map(kp => ({
            ...kp,
            position: {
                x: kp.position.x + cX,
                y: kp.position.y + cY
            }
        }))
    }))
}

async function processStream(
    stream,
    posenetMul = 0.75,
    crop = [15, 15],
    inputResolution = 353,
    netStride = 16,
    handlePoses = createCsvHandler()
) {
    // realtime stream's watermark should be sufficient to store data during processing time
    // fs stream's watermark should be large enough to keep posenet busy (never wait for next intra-frame)
    const streamWatermark = isRealtimeStream(stream) ? 8*1024*1024 : 32*1024*1024

    // demux and get meta info
    const demuxStream = await beamcoder.demuxerStream({ highwaterMark: streamWatermark })
    stream.pipe(demuxStream)

    const demux = await demuxStream.demuxer()

    const vs = demux.streams.find(s => s.codecpar.codec_type === 'video')
    if (!vs) {
        console.error('posenet: can not find video stream.')
        return
    }

    const videoStreamIndex = vs.index
    const {
        width,
        height,
        format: inputPixelFormat
    } = vs.codecpar
    const videoStartTime = vs.start_time / vs.time_base[1] * vs.time_base[0]

    const decoder = beamcoder.decoder({
        demuxer: demux,
        stream_index: videoStreamIndex,
        skip_frame: 'nonkey'
    })

    const vfilt = await beamcoder.filterer({
        filterType: 'video',
        inputParams: [{
            width: width,
            height: height,
            pixelFormat: inputPixelFormat,
            timeBase: vs.time_base,
            pixelAspect: vs.sample_aspect_ratio,
        }],
        outputParams: [{
            pixelFormat: 'rgba'
        }],
        filterSpec: 'format=rgba'
    })

    // posenet & canvas, center crop
    const pnet = await loadPoseNet(posenetMul)

    // determine crop and translation
    const [cW, cH, cX, cY] = computeAnalysisRegion(width, height, crop)
    const canvas = createCanvas(cW, cH)
    const ctx = canvas.getContext('2d')
    const scale = Math.min(1, Math.max(0.2, inputResolution / Math.max(cW, cH)))  // posenet scale

    // create processing budget,
    // if stream is realtime (i.e. stdin) must not apply backpressure,
    // otherwise upstream capture process might stall
    // budget decides whether a frame is skipped
    const budget = createBudgetForStream(stream)

    async function handleDecodedFrames(frames) {
        if (!frames || frames.length === 0) return

        const filtResult = await vfilt.filter(frames)
        for (let rgbFrame of filtResult[0].frames) {
            const pts = rgbFrame.pts / vs.time_base[1] * vs.time_base[0] - videoStartTime

            if (budget.shouldSkipPts(pts)) {
                console.error(`Skipping pts ${pts} due to insufficient budget, ${budget.budgetRequired.toFixed(2)}ms required.`)
                budget.markSkippedPts(pts)
                continue
            }

            budget.markProcessStartForPts(pts)

            const buf = rgbFrame.data[0]
            const bufLen = width * height * 4
            const u8 = new Uint8ClampedArray(buf, 0, bufLen)
            ctx.putImageData(createImageData(u8, width), -cX, -cY)

            const poses = await pnet.estimateMultiplePoses(canvas, scale, false, netStride)
            const truePoses = restoreUncroppedCoordinate(poses, cX, cY)
            await handlePoses(truePoses, rgbFrame, pts)

            budget.markProcessEndForPts(pts)
        }
    }

    let packet = null
    while (packet = await demux.read()) {
        if (packet.stream_index !== videoStreamIndex) {
            continue
        }

        const decoded = await decoder.decode(packet)
        await handleDecodedFrames(decoded.frames)
    }

    const { frames: decoded } = await decoder.flush()
    await handleDecodedFrames(decoded.frames)

    return {
        skippedFrames: budget.skippedFrames()
    }
}

async function processFile(file, ...rest) {
    const readStream = fs.createReadStream(file)
    return processStream(readStream, ...rest)
}

module.exports = {
    processFile,
    processStream,
    createCsvHandler,
    createNdjsonHandler,
}
