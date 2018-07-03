const { createWriteStream } = require('fs')
const { resolve: _resolve } = require('path')
const { homedir } = require('os')
const { dirname } = require('path')
const mkdirp = require('mkdirp')

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
    resolvePath
}