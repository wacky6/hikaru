/*
 * Defer the emission of danmaku by at most `2 * windowSize` milliseconds,
 * but filter out raffle danmaku.
 *
 * If >= threshold number of keys found, they are all filtered out
 */

function RaffleFilter(
    cbk,
    windowSize = RaffleFilter.defaultWindowSize,
    threshold = RaffleFilter.defaultThreshold,
    raffleTimePanelty = RaffleFilter.defaultTimePanelty
) {
    const queue = []
    const history = new Map()
    const raffleEndTime = new Map()
    let timeout = null

    // assume callback will be called
    return (key, time, cbkArg) => {
        time = time || Number.MAX_SAFE_INTEGER

        // process queue
        const processQueue = (curTime) => {
            while (queue.length && queue[0].time < curTime - windowSize) {
                const { key, time, cbkArg } = queue.shift()
                const endTime = raffleEndTime.get(key)
                if (!endTime || time > endTime) {
                    cbk(cbkArg)
                }
            }
        }

        processQueue(time)

        // clear expired raffles
        for (let [key, endTime] of raffleEndTime.entries()) {
            if (time > endTime) {
                raffleEndTime.delete(key)
            }
        }

        // clear expired history
        for (let [key, times] of history.entries()) {
            while (times.length && times[0] < time - windowSize) {
                times.shift()
            }
            if (times.length === 0) {
                history.delete(key)
            }
        }

        // add history
        let rxTimes = history.get(key)
        if (rxTimes) {
            rxTimes.push(time)
        } else {
            rxTimes = [time]
            history.set(key, rxTimes)
        }

        // check for raffle threshold
        const endTime = raffleEndTime.get(key)
        const isRaffle = endTime || rxTimes.length > threshold
        if (isRaffle) {
            const nextEndTime = endTime ? endTime + raffleTimePanelty : time + threshold * raffleTimePanelty
            raffleEndTime.set(key, nextEndTime)
        } else {
            // allow empty keys to permit queue flushing
            if (key) {
                queue.push({ key, time, cbkArg })
            }
        }

        timeout && clearTimeout(timeout)
        if (queue.length) {
            timeout = setTimeout(_ => processQueue(time + 2 * windowSize), 2 * windowSize)
        }
    }
}

RaffleFilter.defaultWindowSize = 1000
RaffleFilter.defaultTimePanelty = 1000
RaffleFilter.defaultThreshold = 3

module.exports = RaffleFilter
module.exports.testOnLog = async (fpath) => {
    const rf = RaffleFilter(({rxtime, text}) => console.log(`${rxtime}\t${new Date(rxtime).toISOString()}\t\t${text}`))
    const rl = require('readline').createInterface({
        input: require('fs').createReadStream(fpath, { encoding: 'utf-8' })
    })
    let count = 0
    rl.on('line', line => {
        count++
        if (count % 10000 === 0) console.error(count)

        if (!line.startsWith('DANMAKU')) return

        const j = JSON.parse(line.slice(8))
        if (!j.danmaku || j.danmaku.cmd !== 'DANMU_MSG') return

        rf(j.danmaku.info[1], j.rx_time, {rxtime: j.rx_time, text: j.danmaku.info[1]})
    })

    rl.on('close', () => rf(null))
}