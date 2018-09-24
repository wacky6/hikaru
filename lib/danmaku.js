const WebSocket = require('ws')
const { EventEmitter } = require('events')

/* Danmaku monitor implementation
 * Follow https://github.com/Dawnnnnnn/bilibili-live-tools/blob/master/bilibiliCilent.py
 */

function BinaryFrameParser() {
    /*
     * Reasponse Frame
     * All integers are in BIG endian
     *
     * | Length  | Magic   |   Ver   | Action  |  Param  |
     * |---------|---------|---------|---------|---------|
     * | 4 bytes | 2 bytes | 2 bytes | 4 bytes | 4 bytes |
     */

    let cur = Buffer.alloc(0)

    return function writeData(data) {
        let frames = []    // extracted frames

        cur = cur.length ? Buffer.concat([cur, data]) : data

        while (cur.length >= 16) {
            const len = cur.readInt32BE(0)
            if (cur.length < len) {
                // wait for next segment
                break
            }

            frames.push({
                magic: cur.readInt16BE(4),
                ver: cur.readInt16BE(6),
                action: cur.readInt32BE(8),
                param: cur.readInt32BE(12),
                payload: cur.slice(16, len),
            })

            cur = cur.slice(len)
        }

        return frames
    }
}

const DANMAKU_LOG = process.env['DANMAKU_LOG']
const HEARTBEAT_INTERVAL = 30 * 1000

// TODO: implement a high availability version that aggregates from all danmaku servers

class DanmakuStream extends EventEmitter{
    constructor(server) {
        super()
        this._server = server
        this._ws = null
        this._heartbeatInterval = null
        this._heartbeatTimeout = HEARTBEAT_INTERVAL
        this._lastHeartbeat = 0
        this._heartbeatSentAt = 0
        this._parseBinaryFrames = null
    }

    connect() {
        this._ws = new WebSocket(`wss://${this._server}/sub`, {
            handshakeTimeout: 10000,
            protocolVersion: 13
        })

        this._ws.on('open', () => this.emit('open'))
        this._ws.on('message', data => this.handleData(data))
        this._ws.on('error', error => this.emit('error', error))
        this._ws.on('ping', data => this.emit('ping', data))
        this._ws.on('pong', data => this.emit('pong', data))

        this._ws.on('close', (code, reason) => {
            this.emit('close', code, reason)
            clearInterval(this._heartbeatInterval)
        })

        this._ws.on('open', () => {
            this._parseBinaryFrames = BinaryFrameParser()

            this._lastHeartbeat = Date.now()
            this._heartbeatInterval = setInterval(_ => {
                this.sendHeartbeat()

                // alternatively, set up a saperate interval to check heartbeat
                if (Date.now() - this._lastHeartbeat > 2 * HEARTBEAT_INTERVAL) {
                    // server seems dead, commit suicide
                    this.close(1001)
                    this.emit('suicide')
                }
            }, this._heartbeatTimeout)
            this.sendHeartbeat()
        })

        return this
    }

    // join discussion channel
    // channelId = roomid
    joinChannel(channelId) {
        this.sendAction(16, 1, 7, 1, { uid: 0, roomid: channelId })
    }

    // send heartbeat
    sendHeartbeat() {
        this.sendAction(16, 1, 2, 1, `[object Object]`)
        this._heartbeatSentAt = Date.now()
    }

    sendAction(magic = 16, ver = 1, action = 7, param = 1, jsonOrStr = {}) {
        /* Binary Frame Structure:
         * All integers are in BIG endian
         *
         * | 4 bytes | 2 bytes | 2 bytes | 4 bytes | 4 bytes |
         * |---------|---------|---------|---------|---------|
         * | Length  | Magic   | Ver     | Action  | Param   |
         *
         * At the time:
         *   Magic          16 (0x10)
         *   Ver            01 (0x01)
         *
         * Action / Parameters:
         *   Join Channel         7 (0x07)
         *      Parameter:    1
         *   Heartbeat            2 (0x02)
         *      Parameter:    1;  Payload should be `[object Object]`
         */
        const payloadStr = typeof jsonOrStr === 'object' ? JSON.stringify(jsonOrStr) : jsonOrStr
        const buf = Buffer.alloc(16 + Buffer.byteLength(payloadStr, 'utf-8'))
        buf.writeInt32BE(buf.length, 0)    // length
        buf.writeInt16BE(magic, 4)      // magic
        buf.writeInt16BE(ver, 6)        // ver
        buf.writeInt32BE(action, 8)     // action
        buf.writeInt32BE(param, 12)     // param
        buf.write(payloadStr, 16, 'utf-8')    // payload

        this._ws && this._ws.send(buf, { binary: true })
    }

    handleData(data) {
        this._parseBinaryFrames(data).forEach(({ magic, ver, action, param, payload }) => {
            if (ver === 1 && action === 8) return // ack to join channel
            if (ver === 1 && action === 3) return this.handleHeartbeat()
            if (ver === 0 && action === 5) return this.handleDanmaku(JSON.parse(payload.toString('utf-8')))
            // TODO: complain unknown version / action
            console.log(`unhandled frame: magic=${magic}, ver=${ver}, action=${action}, param=${param}, data=${payload.toString('utf-8')}`)
        })
    }

    handleDanmaku(danmaku) {
        this.emit('danmaku', danmaku)
    }

    handleHeartbeat() {
        this._lastHeartbeat = Date.now()
        const rtt = Date.now() - this._heartbeatSentAt
        this.emit('heartbeat', rtt)
    }

    close(code, reason) {
        this._ws && this._ws.close(code, reason)
    }
}

async function testDanmaku(_roomid) {
    const { getDanmakuConf, getRoomInfo } = require('../lib/bili-api')

    const { roomId } = await getRoomInfo(_roomid)
    console.log(`canonical roomid: ${roomId}`)

    const { servers } = await getDanmakuConf(roomId)
    console.log(`servers: `)
    servers.forEach(s => console.log(`    ${s.host}`))
    console.log()

    dmk = new DanmakuStream(servers[2].host)
    dmk.connect()

    dmk
        .on('open', () => console.log(`open:`))
        .on('error', error => console.log(`error: ${error}`))
        .on('close', (code, reason) => console.log(`close: ${code} ${reason}`))
        .on('ping', data => console.log(`ping: ${data}`))
        .on('pong', data => console.log(`pong: ${data}`))
        .on('suicide', () => console.log(`suicide`))
        .on('heartbeat', rtt => console.log(`heartbeat: ${rtt} ms`))
        .on('danmaku', danmaku => {
            if (danmaku.cmd === 'DANMU_MSG') {
                console.log(`${danmaku.cmd} ${JSON.stringify(danmaku.info)}`)
            } else {
                console.log(`${danmaku.cmd} ${JSON.stringify(danmaku)}`)
            }
        })

    dmk
        .on('open', () => dmk.joinChannel(roomId))
}

module.exports = {
    DanmakuStream,
    testDanmaku,
    BinaryFrameParser
}
