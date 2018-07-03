const { readJSON, writeJSON, exists } = require('./fs')
const mergeObjects = require('../lib/merge-objects')

const defaultConfig = {
    output_dir: "~/hikaru/",
    capture_list: [],
    idols: []
}

module.exports = {
    async readConfig(path) {
        const onDiskConfig = await exists(path) ? await readJSON(path) : defaultConfig
        return mergeObjects(defaultConfig, onDiskConfig)
    },

    async writeConfig(path, config) {
        const onDiskConfig = await exists(path) ? await readJSON(path) : defaultConfig
        return writeJSON(path, mergeObjects(onDiskConfig, config))
    },

    defaultConfig: { ...defaultConfig }
}