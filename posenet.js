const { createCanvas, createImageData } = require('canvas')
const beamcoder = require('beamcoder')
const { load: loadPoseNet } = require('./posenet/')

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

async function processFile(file, posenetMul = 0.75, centerCrop = true, netSize = 360, netStride = 16) {
    // demux and get meta info
    // TODO: demuxer should be changed to pipe (real time processing during capture)
    const demux = await beamcoder.demuxer(file)
    const vs = demux.streams.find(s => s.codecpar.codec_type === 'video')
    if (!vs) {
        console.error('Can not find video stream.')
        return
    } else {
        console.error(`File opened: ${file}`)
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
    const vMin = Math.min(width, height)
    const [
        cW, cH, cX, cY
    ] = centerCrop
      ? [vMin, vMin, Math.floor((vMin - width) / 2), Math.floor((vMin - height) / 2)]
      : [width, height, 0, 0]

    const canvas = createCanvas(cW, cH)
    const ctx = canvas.getContext('2d')
    const scale = Math.min(1, Math.max(0.2, netSize / vMin))  // posenet scale

    async function handleDecodedFrames(frames) {
        if (!frames || frames.length === 0) return

        const filtResult = await vfilt.filter(frames)
        for (let rgbFrame of filtResult[0].frames) {
            const pts = rgbFrame.pts / vs.time_base[1] * vs.time_base[0] - videoStartTime

            const timeStart = Date.now()

            const buf = rgbFrame.data[0]
            const bufLen = width * height * 4
            const u8 = new Uint8ClampedArray(buf, 0, bufLen)
            ctx.putImageData(createImageData(u8, width), cX, cY)
            const estimated = await pnet.estimateMultiplePoses(canvas, scale, false, netStride)
            const picked = estimated.sort(compareByBoundingBoxSize)[0]

            if (!picked) continue

            // restore centerCrop's translation on coordinates
            const estimation = {
                score: picked.score,
                keypoints: picked.keypoints.map(kp => ({
                    ...kp,
                    position: {
                        x: kp.position.x - cX,
                        y: kp.position.y - cY
                    }
                }))
            }
            const elapsedMs = Date.now() - timeStart

            const partLine = estimation.keypoints
                .map(kp => [kp.score, kp.position.x, kp.position.y].map(float => float.toFixed(2)))
                .reduce((ret, arr) => [...ret, ...arr], [])

            process.stdout.write(`${pts.toFixed(3)},${elapsedMs},${partLine}\n`)

            const bbox = getBoundingBox(picked)
            console.error(`${pts.toFixed(3)},${elapsedMs},${bbox.centerX.toFixed(2)},${bbox.centerY.toFixed(2)},${Math.sqrt(bbox.size).toFixed(2)}`)
        }
    }

    // print csv header
    const partsHeader = PARTS
        .map(partName => [partName, partName+'X', partName+'Y'])
        .reduce((ret, arr) => [...ret, ...arr], [])
    process.stdout.write(`pts,ptime,${partsHeader}\n`)

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
}

module.exports = {
    processFile
}
