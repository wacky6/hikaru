const { DanmakuHistory, DanmakuHistory2, DanmakuHistory3 } = require('./danmaku')
const fs = require('fs')

const lines = fs.readFileSync('dmk-922045.ndjson', { encoding: 'utf-8' }).split(/[\n\r]/g)
const dmk = lines.filter(ln => ln.startsWith('DANMAKU')).map(ln => JSON.stringify(JSON.parse(ln.slice(8)).danmaku))

const h1 = new DanmakuHistory(5000)

const ITERS = 1

console.log('danmaku size = ' + dmk.length * ITERS)

console.time('history 1')
for (let i = 0; i !== ITERS; ++ i) {
    for (let j = 0; j !== dmk.length; ++j) {
        h1.has(dmk[j]) || h1.put(dmk[j])
    }
}
console.timeEnd('history 1')

console.log(h1._history.length)