const test = require('tape')

test('merge-objects', t => {
    const mergeObjects = require('../lib/merge-objects')
    t.deepEqual(
        mergeObjects({ a: 1 }, { b: 2 }, { a: 3 }),
        { a: 3, b: 2 }
    )
    t.end()
})