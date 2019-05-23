const test = require('tape')

test('create right budget', t => {
    const { createBudgetForStream, BudgetForRealtime, BudgetForFile } = require('../lib/stream-budget')

    t.is(createBudgetForStream(process.stdin) instanceof BudgetForRealtime, true)
    t.is(createBudgetForStream(require('fs').createReadStream('/dev/zero')) instanceof BudgetForFile, true)

    t.end()
})

test('Nop Budget', t => {
    const { BudgetForFile } = require('../lib/stream-budget')
    const b = new BudgetForFile()

    t.is(b.shouldSkipPts(0), false)
    b.markProcessStartForPts(0)
    b.markProcessEndForPts()
    t.is(b.shouldSkipPts(1), false)

    t.end()
})

test('Realtime Budget', t => {
    const { BudgetForRealtime } = require('../lib/stream-budget')
    const b = new BudgetForRealtime()

    t.is(b.shouldSkipPts(0), false)
    b.markProcessStartForPts(0, 1000)
    b.markProcessEndForPts(1500)

    // has enough budget
    t.is(b.shouldSkipPts(1), false)
    b.markProcessStartForPts(1, 2000)
    b.markProcessEndForPts(5000)

    // has adjusted based on last process time
    t.is(b.shouldSkipPts(2), true)

    b.markSkippedPts()
    t.is(b.skippedFrames(), 1)

    t.end()
})