const fs = require('fs')
const path = require('path')

// defer import
let tfjs

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
    tfjs = require('@tensorflow/tfjs-node')
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
    load: localLoad
}