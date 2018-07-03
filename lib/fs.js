// file system call wrapper

const { readFile: _readFile, writeFile: _writeFile, access: _access, createWriteStream } = require('fs')
const { promisify } = require('util')
const { resolve: _resolve } = require('path')
const { homedir } = require('os')
const { dirname } = require('path')
const mkdirp = require('mkdirp')

const resolvePath = (...path) => _resolve(...path.map(p => p.replace(/^~/, homedir())))
const ensureDir = path => {
    mkdirp.sync(dirname(path))
    return path
}

const readFile = promisify(_readFile)
const writeFile = promisify(_writeFile)
const access = promisify(_access)

// read / write JSON with:
//   * path resolution
//   * nested path directory creation

module.exports = {
    readJSON(path) {
        return readFile(resolvePath(path), { encoding: 'utf-8' }).then(utf8 => JSON.parse(utf8))
    },
    writeJSON(path, json) {
        return writeFile(ensureDir(resolvePath(path)), JSON.stringify(json, null, "  "), { encoding: 'utf-8' })
    },
    exists(path) {
        return access(resolvePath(path)).then(_ => true, _ => false)
    },
    createWriteStream(path) {
        return createWriteStream(ensureDir(resolvePath(path)), { encoding: null })
    },
    resolvePath
}