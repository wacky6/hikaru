const glob = require('glob')

module.exports = function parsePath(arg) {
    const pathes = arg.map(pathDesc => glob.sync(pathDesc))

    // warn if some file is not found
    for (let i=0; i!==pathes.length; ++i) {
        if (pathes[i].length === 0) {
            console.error(`warning: "${arg[i]}" does not exist.`)
        }
    }

    const ret = pathes.reduce((acc, cur) => [...acc, ...cur], [])

    if (ret.length === 0) {
        throw new Error('input files must not be empty')
    }

    return ret
}