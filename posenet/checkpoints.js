// should only contain built-in imports/requires

const fs = require('fs/promises')
const path = require('path')
const axios = require('axios')

const GOOGLE_STORAGE_DIR = 'https://storage.googleapis.com/tfjs-models/weights/posenet/'
const CHECKPOINT_DIRS = [
    'mobilenet_v1_101/', 'mobilenet_v1_100/', 'mobilenet_v1_075/',
    'mobilenet_v1_050/'
]

async function downloadUrlToPath(url, localPath, trial = 0) {
    if (trial === 5)
        throw new Error('Retry count exceeded.')

    try {
        const res = await axios.get(url, {responseType: 'arraybuffer'})
        if (res.status !== 200) {
            process.stderr.write('!')
            console.error(`\n${res.statusCode} \t ${url}`)
            throw new Error('Non OK Response Code')
        }

        process.stderr.write('.')
        await fs.writeFile(localPath, res.data)
    } catch (e) {
        console.log(e.stack)
        process.stderr.write('r')
        await downloadUrlToPath(url, localPath, trial + 1)
    }
}

async function fetchCheckpoints() {
    console.error('Fetching PoseNet Model:')
    try{
        for (let checkpoint_dir of CHECKPOINT_DIRS) {
            const baseDir = path.resolve(__dirname, checkpoint_dir) + '/'
            const urlBaseDir = checkpoint_dir
            await fs.mkdir(baseDir, { recursive: true })

            const manifestUrl = `${GOOGLE_STORAGE_DIR}${urlBaseDir}manifest.json`
            const manifestLocalPath = `${baseDir}manifest.json`
            await downloadUrlToPath(manifestUrl, manifestLocalPath)

            const manifest = JSON.parse(await fs.readFile(manifestLocalPath, {encoding: 'utf-8'}))
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
    console.error(' ✅  Done')
}

module.exports = {
    fetchCheckpoints
}