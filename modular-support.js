const { accessSync, constants } = require('fs')
const { resolve } = require('path')

function dirExistsSync(dir) {
    try {
        accessSync(dir, constants.F_OK)
        return true
    } catch(e) {
        return false
    }
}

module.exports = {
    hasPosenetSupport: dirExistsSync(resolve(__dirname, './posenet'))
}