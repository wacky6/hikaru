const { createWriteStream, stat } = require('fs')
const { resolve: _resolve } = require('path')
const { homedir } = require('os')
const { dirname } = require('path')
const mkdirp = require('mkdirp')
const expandTemplate = require('../lib/string-template')

const resolvePath = (...path) => _resolve(...path.map(p => p.replace(/^~/, homedir())))
const ensureDir = path => {
    mkdirp.sync(dirname(path))
    return path
}

// wrapped fs operations:
//   * path resolution
//   * nested path directory creation
module.exports = {
    createWriteStream(path) {
        return createWriteStream(ensureDir(resolvePath(path)), { encoding: null })
    },
    ensureDir,
    resolvePath,
    getFileSize(path) {
        return new Promise(resolve => stat(path, (err, stat) => resolve(err ? null : stat.size)))
    },
    getOutputPath(output, outputDir, opts = {}) {
        return (
            output === '-'
                ? '-'
                : resolvePath(outputDir, expandTemplate(output, opts))
        )
    }
}