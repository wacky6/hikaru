const test = require('tape')
const {resolve} = require('path')
const {spawnSync} = require('child_process')
const {accessSync, constants: fsConstants} = require('fs')

test('posenet is reasonable', async t => {
    const { processMedia } = require('../posenet')

    const detections = []

    await processMedia(
        resolve(__dirname, 'pose_test_sample.mp4'), 1.01, [20, 20], 513, 8,
        (poses) => detections.push(poses)
    )

    t.ok(detections[0].length >= 1)
    t.ok(detections[1].length >= 1)
    t.ok(detections[2].length === 0)

    t.end()
})

test('extract plumbing works', async t => {
    spawnSync(
        'node',
        [
            resolve(__dirname, '../bin/hikaru'),
            'extract',
            resolve(__dirname, 'pose_test_sample.mp4'),
            '-t',
            'dance',
            '-A',
            '-m 1.01 -c 20,20',
            '-Fd',
            '-p',
            '/tmp/out.csv'
        ]
    )

    accessSync(resolve(__dirname, '/tmp/out.csv'), fsConstants.R_OK)

    t.end()
})

test('pose segmentation dump', async t => {
    spawnSync(
        'python3',
        [
            resolve(__dirname, '../posenet/pose-seg.py'),
            resolve(__dirname, 'pose_test_sample.csv'),
            '-d',
            resolve(__dirname, '/tmp/out.png')
        ]
    )

    accessSync(resolve(__dirname, '/tmp/out.png'), fsConstants.R_OK)

    t.end()
})
