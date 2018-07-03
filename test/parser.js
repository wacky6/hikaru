const test = require('tape')

test('parse room', t => {
    const { parseRoom } = require('../lib/parser')

    t.equal(parseRoom("123"), "123", "parse numerical string")
    t.equal(parseRoom("https://live.bilibili.com/123"), "123", "parse plain url")
    t.equal(parseRoom("https://live.bilibili.com/123?spm_id_from=333.334.bili_live.11"), "123", "parse index recommend url")

    t.end()
})