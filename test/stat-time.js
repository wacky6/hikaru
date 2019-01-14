const test = require('tape')

test('parse room', t => {
    const tst = require('../handlers/providence').toStatTime
    const moment = require('moment-timezone')

    const test = (inputInCst, expectInCst) => (
        t.equal(
            tst(moment.tz(inputInCst, 'YYYY-MM-DD HH:mm:ss', 'Asia/Shanghai').toDate()).getTime(),
            moment.tz(expectInCst, 'YYYY-MM-DD HH:mm:ss', 'Asia/Shanghai').toDate().getTime()
        )
    )

    test(
        '2019-01-14 08:00:00',
        '2019-01-14 08:00:00',
    )

    test(
        '2019-01-14 14:00:00',
        '2019-01-14 08:00:00',
    )

    test(
        '2019-01-14 23:00:00',
        '2019-01-14 08:00:00',
    )

    test(
        '2019-01-15 00:00:00',
        '2019-01-14 08:00:00',
    )

    test(
        '2019-01-15 07:59:59',
        '2019-01-14 08:00:00',
    )

    t.end()
})