const { fetchCheckpoints, load } = require('./model')
const { processFile, processStream } = require('./posenet')

module.exports = {
    fetchCheckpoints,
    load,
    processFile,
    processStream
}

