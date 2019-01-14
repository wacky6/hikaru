const WebSocket = require('ws')
const { EventEmitter } = require('events')
const fs = require('fs')
const { getDanmakuConf } = require('./bili-api')
const shuffle = require('shuffle-array')

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

function createOutputStream(path) {
    return !path        ? null :
           path === '-' ? process.stdout :
                          fs.createWriteStream(path, { flags: 'a' })
}

const DANMAKU_LOG = process.env['DANMAKU_LOG']
const HEARTBEAT_INTERVAL = 30 * 1000
const HEARTBEAT_DEADLINE = 10 * 1000

class DanmakuStream extends EventEmitter{
    constructor(server) {
        super()
        this._server = server
        this._ws = null
        this._heartbeatIntervalDuration = HEARTBEAT_INTERVAL
        this._heartbeatDeadline = HEARTBEAT_DEADLINE
        this._heartbeatInterval = null
        this._heartbeatTimeout = null
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
            this._ws = null
            this.emit('close', code, reason)
            clearInterval(this._heartbeatInterval)
            clearTimeout(this._heartbeatTimeout)
        })

        this._ws.on('open', () => {
            this._parseBinaryFrames = BinaryFrameParser()
            this._heartbeatInterval = setInterval(_ => this.sendHeartbeat(), this._heartbeatIntervalDuration)
            this.sendHeartbeat()
        })

        return this
    }

    // join discussion channel
    // channelId = canonical roomid
    joinChannel(channelId) {
        this.sendAction(16, 1, 7, 1, { uid: 0, roomid: channelId })
    }

    // send heartbeat
    sendHeartbeat() {
        this.sendAction(16, 1, 2, 1, `[object Object]`)

        this._heartbeatSentAt = Date.now()
        this._heartbeatTimeout = setTimeout(_ => {
            this.close(1001)
            this.emit('suicide')
        }, this._heartbeatDeadline)
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

        this._ws && this._ws.send(buf, { binary: true }, err => {
            err && console.error('WSS\t' + JSON.stringify({ event: 'error', error: err.message, stack: err.stack }))
        })
    }

    handleData(data) {
        this._parseBinaryFrames(data).forEach(({ magic, ver, action, param, payload }) => {
            if (ver === 1 && action === 8) return // ack to join channel
            if (ver === 1 && action === 3) return this.handleHeartbeat()
            if (ver === 0 && action === 5) return this.handleDanmaku(payload.toString('utf-8'),  { server: this._server, rx_time: Date.now() })
            // TODO: complain unknown version / action
            console.log(`unhandled frame: magic=${magic}, ver=${ver}, action=${action}, param=${param}, data=${payload.toString('utf-8')}`)
        })
    }

    handleDanmaku(danmakuStr, meta) {
        this.emit('danmaku', danmakuStr, meta)
    }

    handleHeartbeat() {
        clearTimeout(this._heartbeatTimeout)
        const rtt = Date.now() - this._heartbeatSentAt
        this.emit('heartbeat', rtt)
    }

    close(code, reason) {
        this._ws && this._ws.close(code, reason)
    }
}

class DanmakuHistory {
    constructor(size = DanmakuHistory.DEFAULT_SIZE) {
        this._history = []
        this._set = new Set()
        this._size = size
    }

    put(str) {
        this._history.push(str)
        this._set.add(str)
        this._history.length > this._size && this._set.delete(this._history.shift())
    }

    has(str) {
        return this._set.has(str)
    }
}

// assumption: 10 secs time discrepancy, 100 danmaku / sec
DanmakuHistory.DEFAULT_SIZE = 1000

function prettyInlineJson(j) {
    return JSON.stringify(j)
    .replace(/","/g, '", "')
    .replace(/":"/g, '": "')
    .replace(/^{/g, '{ ')
    .replace(/}$/g, ' }')
}

const HADS_RETRY_TIMEOUT = 5 * 1000

class HighAvailabilityDanmakuStream extends EventEmitter {
    /*
     * canonicalRoomId: the roomId to listen to
     *     also called read roomId in bilibili's response,
     * opts: {
     *     historySize: danmaku history size for aggregation, default = DanmakuHistory.DEFAULT_SIZE
     * }
     */
    constructor(canonicalRoomId, opts = {}) {
        super()

        const {
            logPath = DANMAKU_LOG,
            redundency = 1,    // additional servers to connect to
        } = opts

        this._redundency = redundency
        this._maxServerCount = 1 + this._redundency

        this._canonicalRoomId = canonicalRoomId
        this._servers = new Map()
        this._log = createOutputStream(logPath)

        this._getServerConfTimeout = null
        this._danmakuHistory = new DanmakuHistory(opts.historySize)
    }

    connect() {
        getDanmakuConf(this._canonicalRoomId).then(
            ({servers}) => {
                this.log('HADS', { type: 'info', message: 'danmaku servers', servers })
                this.connectServers(servers.map(s => s.host))
                this._getServerConfTimeout = null
            },
            err => {
                this.log('HADS', { type: 'error', message: 'getRoomInfo fails', error: err.message })
                this._getServerConfTimeout = setTimeout(_ => this.connect(), HADS_RETRY_TIMEOUT)
            }
        )
    }

    // merge current servers to opened servers
    // honoring redundency setting
    connectServers(servers) {
        const availableServerCount = Math.max(0, this._maxServerCount - this._servers.size)

        // find random new servers to fill available server slots
        const newServers = servers.filter(s => !this._servers.has(s))
        const connectServers = shuffle(newServers).slice(0, availableServerCount)

        // connect to all of them
        connectServers.forEach(server => {
            const dmk = new DanmakuStream(server)
            this._servers.set(server, dmk)

            dmk.connect()

            dmk
                .on('open', () => this.log('HADS', { server, event: 'open' }))
                .on('error', error => this.log('HADS', { server, event: 'error', error: error.message }))
                .on('close', (code, reason) => this.log('HADS', { server, event: 'close', server, code, reason }))
                .on('suicide', () => this.log('HADS', { server, event: 'suicide' }))
                .on('heartbeat', rtt => this.log('HADS', { server, event: 'heartbeat', rtt }))
                .on('danmaku', danmaku => this.log('DANMAKU', { server, event: 'danmaku', rx_time: Date.now(), danmaku: JSON.parse(danmaku) }))

            dmk
                .on('open', () => dmk.joinChannel(this._canonicalRoomId))
                .on('close', () => {
                    this._servers.delete(server)
                    this.connect()
                })
                .on('danmaku', (...args) => this.handleDanmaku(...args))

            // propagate ws event for stats
            dmk
                .on('open', () => this.emit('hads', { event: 'open', server }))
                .on('close', () => this.emit('hads', { event: 'close', server }))
                .on('suicide', () => this.emit('hads', { event: 'suicide', server }))
                .on('heartbeat', rtt => this.emit('heartbeat', { event: 'heartbeat', server, rtt }))
        })
    }

    handleDanmaku(danmakuStr, meta) {
        if (!this._danmakuHistory.has(danmakuStr)) {
            this._danmakuHistory.put(danmakuStr)
            this.emit('danmaku', danmakuStr, meta)
        }
    }

    close() {
        this._servers.forEach(dmk => dmk.close())
        this._log.end()
        clearTimeout(this._getServerConfTimeout)
    }

    getServerCount() {
        return this.servers.size
    }

    log(type, payload = {}) {
        if (this._log) {
            this._log.write(`${type}\t${prettyInlineJson(payload)}\n`)
        }
    }
}

async function testHADanmaku(_roomid) {
    const { getRoomInfo } = require('../lib/bili-api')

    const { roomId } = await getRoomInfo(_roomid)
    const dmk = new HighAvailabilityDanmakuStream(roomId, { redundency: 2 })
    dmk.connect()

    dmk.on('danmaku', (danmakuStr, meta) => {
        const danmaku = JSON.parse(danmakuStr)
        let msg = `${new Date(meta.rx_time).toISOString()}\t${meta.server}\t`
        switch (danmaku.cmd) {
            case 'DANMU_MSG': msg += ('DANMAKU\t' + prettyInlineJson(danmaku.info)); break
            case 'SEND_GIFT':
            case 'WELCOME_GUARD':
            case 'ENTRY_EFFECT':
            case 'WELCOME':   msg += (danmaku.cmd + '\t' + prettyInlineJson(danmaku.data)); break;
            default:          msg += ('UNKNOWN\t' + prettyInlineJson(danmaku)); break
        }
        msg && console.log(msg)
    })
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
        .on('danmaku', danmakuStr => {
            danmaku = JSON.parse(danmakuStr)
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
    HighAvailabilityDanmakuStream,
    testDanmaku,
    testHADanmaku,
    BinaryFrameParser,
    DanmakuHistory,
}
