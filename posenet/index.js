const { fetchCheckpoints, load } = require('./model')
const { processFile, processStream, createCsvHandler, createNdjsonHandler } = require('./posenet')

module.exports = {
    fetchCheckpoints,
    load,
    processFile,
    processStream,
    createCsvHandler,
    createNdjsonHandler
}

