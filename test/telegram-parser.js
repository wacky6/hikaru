const test = require('tape')

test('parse room', t => {
    const tp = require('../lib/telegram-parser')

    t.deepEqual(
        tp('bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11:123'),
        {
            token: 'bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
            chatId: 123
        }
    )

    t.equal(tp(''), null)
    t.equal(tp(undefined), null)

    t.end()
})