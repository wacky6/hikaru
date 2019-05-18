const tfjs = require('@tensorflow/tfjs-node')
const fs = require('fs')
const mkdirp = require('mkdirp')
const https = require('https')
const path = require('path')

const GOOGLE_STORAGE_DIR = 'https://storage.googleapis.com/tfjs-models/weights/posenet/'
const CHECKPOINT_DIRS = [
    'mobilenet_v1_101/', 'mobilenet_v1_100/', 'mobilenet_v1_075/',
    'mobilenet_v1_050/'
]

const downloadUrlToPath = (url, localPath) => new Promise((resolve, reject) => {
    https.get(url, res => {
        if (res.statusCode !== 200) {
            console.error(`\n${res.statusCode} \t ${url}`)
            reject(new Error('Non OK Response Code'))
        } else {
            process.stderr.write('.')
        }
        const outStream = fs.createWriteStream(localPath)
        const pipe = res.pipe(outStream)
        pipe.on('close', resolve)
    })
    .on('error', e => reject(e))
})

async function fetchCheckpoints() {
    console.error('Fetching PoseNet Model:')
    try{
        for (let checkpoint_dir of CHECKPOINT_DIRS) {
            const baseDir = path.resolve(__dirname, checkpoint_dir) + '/'
            const urlBaseDir = checkpoint_dir
            mkdirp.sync(baseDir)

            const manifestUrl = `${GOOGLE_STORAGE_DIR}${urlBaseDir}manifest.json`
            const manifestLocalPath = `${baseDir}manifest.json`
            await downloadUrlToPath(manifestUrl, manifestLocalPath)

            const manifest = JSON.parse(fs.readFileSync(manifestLocalPath, {encoding: 'utf-8'}))
            await Promise.all(
                Object.keys(manifest).map(variableName => {
                    const {filename} = manifest[variableName]
                    return downloadUrlToPath(`${GOOGLE_STORAGE_DIR}${urlBaseDir}${filename}`, `${baseDir}${filename}`)
                })
            )

            // TODO: validate downloaded data is correct (use a sample image?)
        }
    } catch(e) {
        console.error('⚠️  Error fetching model\n')
        console.error(e.stack)
        console.error('')
        process.exit(-1)
    }
    console.error('Done ✅')
}

class LocalCheckpointLoader {
    constructor(url) {
        this.baseDir = path.resolve(__dirname, url.split('/')[6]) + '/'
        this.manifest = JSON.parse(fs.readFileSync(`${this.baseDir}manifest.json`, {encoding: 'utf-8'}))
        this.variables = {}
    }
    getCheckpointManifest() {
        return this.manifest
    }
    getAllVariables() {
        for (let variableName in this.manifest) {
            this.variables[variableName] = this.getVariable(variableName)
        }
        return this.variables
    }
    getVariable(variableName) {
        const {filename} = this.manifest[variableName]
        const filePath = `${this.baseDir}${filename}`
        const buf = fs.readFileSync(filePath)
        const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength)
        const values = new Float32Array(arrayBuffer)
        const checkpointTensor = tfjs.tensor(values, this.manifest[variableName].shape, 'float32')
        return checkpointTensor
    }
}

class LocalModelWeights {
    constructor(variables) {
        this.variables = variables
    }

    weights(layerName) {
        return this.variables[`MobilenetV1/${layerName}/weights`]
    }

    depthwiseBias(layerName) {
        return this.variables[`MobilenetV1/${layerName}/biases`]
    }

    convBias(layerName) {
        return this.depthwiseBias(layerName)
    }

    depthwiseWeights(layerName) {
        return this.variables[`MobilenetV1/${layerName}/depthwise_weights`]
    }

    dispose() {
        for (const varName in this.variables) {
            this.variables[varName].dispose();
        }
    }
}

async function localLoad(multiplier = 0.75) {
    const {checkpoints, MobileNet, PoseNet} = require('@tensorflow-models/posenet')
    const checkpoint = checkpoints[multiplier]
    const checkpointLoader = new LocalCheckpointLoader(checkpoint.url)
    const variables = checkpointLoader.getAllVariables()
    const weights = new LocalModelWeights(variables)
    const mobileNet = new MobileNet(weights, checkpoint.architecture)
    const poseNet = new PoseNet(mobileNet)
    return poseNet
}

module.exports = {
    fetchCheckpoints,
    load: localLoad
}

