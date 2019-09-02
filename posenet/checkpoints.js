// should only contain built-in imports/requires

const fs = require('fs')
const agent = require('superagent')
const path = require('path')

const GOOGLE_STORAGE_DIR = 'https://storage.googleapis.com/tfjs-models/weights/posenet/'
const CHECKPOINT_DIRS = [
    'mobilenet_v1_101/', 'mobilenet_v1_100/', 'mobilenet_v1_075/',
    'mobilenet_v1_050/'
]

const downloadUrlToPath = (url, localPath, trial = 0) => new Promise((resolve, reject) => {
    if (trial === 5) {
        return reject(new Error('Retry Count Exceeded.'))
    }

    agent.get(url).responseType('blob').then(
        res => {
            if (!res.ok) {
                process.stderr.write('!')
                console.error(`\n${res.statusCode} \t ${url}`)
                reject(new Error('Non OK Response Code'))
            } else {
                process.stderr.write('.')
            }

            fs.writeFile(localPath, res.body, resolve)
        },
        _ => {
            process.stderr.write('r')
            downloadUrlToPath(url, localPath, trial + 1)
        }
    )
})

async function fetchCheckpoints() {
    console.error('Fetching PoseNet Model:')
    try{
        for (let checkpoint_dir of CHECKPOINT_DIRS) {
            const baseDir = path.resolve(__dirname, checkpoint_dir) + '/'
            const urlBaseDir = checkpoint_dir
            fs.mkdirSync(baseDir, { recursive: true })

            const manifestUrl = `${GOOGLE_STORAGE_DIR}${urlBaseDir}manifest.json`
            const manifestLocalPath = `${baseDir}manifest.json`
            await downloadUrlToPath(manifestUrl, manifestLocalPath)

            const manifest = JSON.parse(fs.readFileSync(manifestLocalPath, {encoding: 'utf-8'}))
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