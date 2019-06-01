const { dirname, resolve: pathResolve } = require('path')
const { spawn, execFile } = require('child_process')
const { parseArgsStringToArgv } = require('string-argv')

const NODE_EXEC = process.execPath
const HIKARU_EXEC = pathResolve(__dirname, '../bin/hikaru')

module.exports = {
    'dance': {
        analyzeStream: (mediaReadStream, args) => {
            const analyzer = spawn(NODE_EXEC, [
                HIKARU_EXEC,
                'pose',
                '-',
                '-o',
                '-',
                '-p',
                ...parseArgsStringToArgv(args || '')
            ], {
                stdio: [ mediaReadStream, 'pipe', 'pipe' ]
            })
            return {
                resultStream: analyzer.stdout,
                errorStream: analyzer.stderr,
                onFinish: new Promise(resolve => analyzer.once('exit', (code) => resolve(code))),
                _childProcess: analyzer
            }
        },
        analyzeFile: (mediaPath, args) => {
            const analyzer = spawn(NODE_EXEC, [
                HIKARU_EXEC,
                'pose',
                mediaPath,
                '-o',
                '-',
                '-p',
                ...parseArgsStringToArgv(args || '')
            ], {
                stdio: [ 'ignore', 'pipe', 'pipe' ]
            })
            return {
                resultStream: analyzer.stdout,
                errorStream: analyzer.stderr,
                onFinish: new Promise(resolve => analyzer.once('exit', (code) => resolve(code))),
                _childProcess: analyzer
            }
        },
        segmentFile: (analyzeResultPath, args) => new Promise((resolve, reject) => {
            let exitCode = null
            execFile('/usr/bin/env', [
                'python3',
                pathResolve(dirname(HIKARU_EXEC), '../posenet/pose-seg.py'),
                analyzeResultPath,
                ...parseArgsStringToArgv(args || '')
            ], {
                encoding: 'utf8',
                maxBuffer: 8 * 1024 * 1024
            }, (error, stdout, stderr) => {
                if (error) return reject(error)    // can not spawn
                if (exitCode !== 0) return reject(new Error(`Segmenter exited with non-zero code: ${exitCode}`))

                try {
                    // parse result
                    const segments = stdout
                        .split(/[\n\r]+/g)
                        .map(s => s.trim())
                        .filter(s => s.length)
                        .map(s => JSON.parse(s))
                        .map(j => [j.start_t, j.end_t])

                    return resolve({
                        segments,
                        _stderr: stderr
                    })
                } catch(e) {
                    return reject(new Error(`Fail to parse segmentation result: ${e.message}`))
                }
            })
            .once('exit', (code) => exitCode = (typeof code === 'number' ? code : -1))
        }),
        getDefaultAnalyzeResultPath: (mediaPath) => {
            const ret = require('./pose').getDefaultOutputPath(mediaPath, 'csv')
            return ret === '-' || ret === '' ? null : ret
        }
    }
}
