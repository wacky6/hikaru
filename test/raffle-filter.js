const RF = require('../lib/raffle-filter')
const test = require('tape')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('raffle-filter', async t => {
    let emitted = []
    const rf = RF(arg => emitted.push(arg), 5, 2, 3)
    const msg = (m, t) => rf(m, t, m)

    msg('1', 1)
    msg('2', 2)
    msg('1', 3)
    msg('1', 3)
    msg('3', 8)
    t.deepEqual(emitted, ['2'])

    msg('1', 16)
    t.deepEqual(emitted, ['2', '3'])

    msg(null, 30)
    t.deepEqual(emitted, ['2', '3', '1'])

    msg('x', 32)
    await sleep(15)
    t.deepEqual(emitted, ['2', '3', '1', 'x'])

    t.end()
})