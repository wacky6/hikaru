/*
 * Defer the emission of danmaku by `windowSize` milliseconds,
 * but filter out raffle danmaku.
 *
 * If >= threshold number of keys found, they are all filtered out
 */

function RaffleFilter(cbk, windowSize = RaffleFilter.defaultWindowSize, threshold = RaffleFilter.defaultThreshold) {
    const counter = new Map()

    return (key, cbkArg) => {
        // set count
        const count = counter.get(key)
        counter.set(key, count ? count + 1 : 1)

        // emission timeout
        setTimeout(_ => {
            if (counter.get(key) < threshold) {
                cbk(cbkArg)
            }
        }, windowSize)

        // forget timeout
        setTimeout(_ => {
            const count = counter.get(key)
            if (count <= 1) {
                counter.delete(key)
            } else {
                counter.set(key, count - 1)
            }
        }, 3 * windowSize)
    }
}

RaffleFilter.defaultWindowSize = 2000
RaffleFilter.defaultThreshold = 8

module.exports = RaffleFilter