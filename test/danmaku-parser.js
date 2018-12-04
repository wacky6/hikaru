const test = require('tape')
const { BinaryFrameParser } = require('../handlers/_danmaku')

/*
 * | Length  | Magic   |   Ver   | Action  |  Param  | Payload  |
 * |---------|---------|---------|---------|---------|----------|
 * | 4 bytes | 2 bytes | 2 bytes | 4 bytes | 4 bytes | len - 16 |
 */
test('parse', t => {
    const parse = BinaryFrameParser()

    const completeFrame = Buffer.concat([
        Buffer.from('00000014', 'hex'),    // length
        Buffer.from('00100001', 'hex'),    // magic / ver
        Buffer.from('00000007', 'hex'),    // action
        Buffer.from('00000002', 'hex'),    // param
        Buffer.from('abcd', 'utf-8'),      // payload
    ])

    const completeFrameParsed = {
        magic: 16,
        ver: 1,
        action: 7,
        param: 2,
        payload: Buffer.from('abcd', 'utf-8')
    }

    t.deepEqual(parse(completeFrame), [completeFrameParsed])

    const twoFrames = Buffer.concat([
        // first frame
        Buffer.from('00000012', 'hex'),    // length
        Buffer.from('00100000', 'hex'),    // magic / ver
        Buffer.from('00000008', 'hex'),    // action
        Buffer.from('00000003', 'hex'),    // param
        Buffer.from('ab', 'utf-8'),        // payload
        // second frame
        Buffer.from('00000013', 'hex'),    // length
        Buffer.from('00100001', 'hex'),    // magic / ver
        Buffer.from('00000009', 'hex'),    // action
        Buffer.from('00000004', 'hex'),    // param
        Buffer.from('abc', 'utf-8'),       // payload
    ])

    t.deepEqual(parse(twoFrames), [{
        magic: 16,
        ver: 0,
        action: 8,
        param: 3,
        payload: Buffer.from('ab', 'utf-8')
    }, {
        magic: 16,
        ver: 1,
        action: 9,
        param: 4,
        payload: Buffer.from('abc', 'utf-8')
    }])

    // test partial frame, case 1: reached minimum length
    t.deepEqual(parse(completeFrame.slice(0, 16)), [])
    t.deepEqual(parse(completeFrame.slice(16)), [completeFrameParsed])

    // test partial frame, case 2: less than minimum length
    t.deepEqual(parse(completeFrame.slice(0, 8)), [])
    t.deepEqual(parse(completeFrame.slice(8)), [completeFrameParsed])

    // test partial frame, case 3: exactly empty
    t.deepEqual(parse(completeFrame.slice(0, 1)), [])
    t.deepEqual(parse(completeFrame.slice(1)), [completeFrameParsed])

    // test partial frame, case 4: partial payload
    t.deepEqual(parse(completeFrame.slice(0, 18)), [])
    t.deepEqual(parse(completeFrame.slice(18)), [completeFrameParsed])

    t.end()
})