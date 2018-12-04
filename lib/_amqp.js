const { EventEmitter } = require('events')
const amqp = require('amqplib')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const nop = _ => null

class BaseAmqp extends EventEmitter{
    constructor(url) {
        super()
        this._url = url
        this._conn = null
        this._channel = null
        this._connecting = null
        this._closed = true
    }

    _onChannel(channel) {
        throw new Error('not implemented')
    }

    _onChannelCreated(channel) {
        return
    }

    connect() {
        this._closed = false
        if (this._conn) return Promise.resolve(true)
        if (this._connecting) return this._connecting

        return this._connecting = amqp.connect(this._url)
            .then(conn => {
                conn.on('error', nop)
                conn.on('close', _ => {
                    console.log(`amqp: connection closed`)
                    this._conn = null
                    if (!this._closed) {
                        this.connect()
                    }
                })
                return conn.createChannel()
                    .then(ch => Promise.resolve(this._onChannel(ch)).then(_ => ch, err => console.error(err)))
                    .then(ch => {
                        console.error(`amqp: connection established: ${this._url}`)
                        this._onChannelCreated(ch)
                        ch.on('error', nop)
                        ch.on('close', _ => this._channel = null)
                        this._conn = conn
                        this._channel = ch
                        this._connecting = false
                        return true
                    })
            })
            .catch(_ => {
                this._connecting = false
                return sleep(1000).then(_ => this.connect())
            })
    }

    close() {
        if (!this._conn) return
        this._closed = true
        return this._conn.close()
    }
}

module.exports = {
    BaseAmqp,
    defaultEndpoint: 'amqp://localhost/',
    defaultExchangeName: 'hikaru.danmaku',
    exchangeOptions: {
        durable: false,
        messageTtl: 10000
    },
    subscribeQueueOptions: {
        exclusive: true,
        durable: false,
        autoDelete: true,
        messageTtl: 10000
    }
}