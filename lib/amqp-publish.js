const { BaseAmqp, exchangeOptions, defaultEndpoint } = require('./_amqp')

class AmqpPublisher extends BaseAmqp {
    constructor(url, name) {
        super(url)
        this._name = name
        this._queueFull = false
        this.connect()
    }

    _onChannel(ch) {
        return ch.assertExchange(this._name, 'fanout', exchangeOptions)
    }

    send(payload) {
        if (!this._channel) return false
        if (this._queueFull) return false
        const buf = typeof payload === 'string' ? Buffer.from(payload)
                  : typeof payload === 'object' ? Buffer.from(JSON.stringify(payload))
                  : ''
        const ret = this._channel.publish(this._name, '', buf, {
            persistent: false,
            expiration: 0,
            mandatory: false
        })
        if (!ret) {
            console.error(`amqp: queue full`)
            this._queueFull = true
            this._channel.once('drain', _ => this._queueFull = false)
        }
        return ret
    }
}

function testAmqp(rate = 1000, interval = 1000) {
    let pub = new AmqpPublisher(defaultEndpoint, 'test')
    let count = 0
    pub.connect().then(_ => {
        setInterval(_ => {
            const payload = new Date().toISOString().repeat(40)
            for (let i=0; i!==rate; ++i) {
                const ret = pub.send(payload)
                if (!ret) break
                count += 1
            }
        }, interval)
    })
    setInterval(_ => {
        console.log(`tx rate: ${count}/s`)
        count = 0
    }, 1000)
}

module.exports = AmqpPublisher
module.exports.testAmqp = testAmqp