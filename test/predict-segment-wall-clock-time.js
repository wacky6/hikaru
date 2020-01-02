const test = require('tape')
const {predictSegmentWallClockFileName} = require('../handlers/extract')

test('timestamp', t => {
    // filename differs from input
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_1529941957130.flv', 0),
        'idol_2018-06-25_235238'
    );
    // normal scenario
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_1529941957130.flv', 181),
        'idol_2018-06-25_235538'
    );
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_1529941957130.flv', 602),
        'idol_2018-06-26_000239'
    );
    t.end()
})

test('dash-date-dash-time', t => {
    // filename differs from input
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_23-52-37.flv', 0),
        'idol_2018-06-25_235238'
    );
    // normal scenario
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_23-52-37.flv', 181),
        'idol_2018-06-25_235538'
    );
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_23-52-37.flv', 602),
        'idol_2018-06-26_000239'
    );
    t.end()
})

test('dash-date-time', t => {
    // filename differs from input
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_235237.flv', 0),
        'idol_2018-06-25_235238'
    );
    // normal scenario
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_235237.flv', 181),
        'idol_2018-06-25_235538'
    );
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25_235237.flv', 602),
        'idol_2018-06-26_000239'
    );
    t.end()
})

test('misleading inputs', t => {
    // dash in idol name
    t.equal(
        predictSegmentWallClockFileName('idol-_2018-06-25_235237.flv', 0),
        'idol-_2018-06-25_235238'
    );
    // dash number dash in idol name
    t.equal(
        predictSegmentWallClockFileName('idol3-3_2018-06-25_235237.flv', 181),
        'idol3-3_2018-06-25_235538'
    );
    // without time info
    t.equal(
        predictSegmentWallClockFileName('idol-.flv', 602),
        null
    );
    // partial date
    t.equal(
        predictSegmentWallClockFileName('idol_2018-06-25.flv', 181),
        null
    );
    // partial time
    t.equal(
        predictSegmentWallClockFileName('idol_235237.flv', 181),
        null
    );
    t.end()
})
