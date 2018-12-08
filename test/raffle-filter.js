const RF = require('../lib/raffle-filter')
const test = require('tape')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('raffle-filter', async t => {
    let emitted = []
    const rf = RF(arg => emitted.push(arg), 5, 2)

    rf('1', '1')
    rf('2', '2')
    rf('1', '1')
    rf('1', '1')

    await sleep(6)

    t.deepEqual(emitted, ['2'])

    await sleep(15)

    rf('1', '1')

    await sleep(6)

    t.deepEqual(emitted, ['2', '1'])

    t.end()
})