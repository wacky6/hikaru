const test = require('tape')

test('parse room', t => {
    const pt = require('../lib/string-template')

    t.equal(
        pt('@idol-@time-fixedstr.@ext', {
            idol: 'test',
            time: 'time',
            ext: 'flv'
        }),
        'test-time-fixedstr.flv'
    )

    t.end()
})