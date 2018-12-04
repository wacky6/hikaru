const { BaseAmqp, exchangeOptions } = require('./_amqp')

class AmqpPublisher extends BaseAmqp {
    constructor(url, name) {
        super(url)
        this._name = name
    }

    _onChannel(ch) {
        return ch.assertExchange(this._name, 'fanout', exchangeOptions)
    }

    send(payload) {
        if (!this._channel) return false
        const buf = typeof payload === 'string' ? Buffer.from(payload)
                  : typeof payload === 'object' ? Buffer.from(JSON.stringify(payload))
                  : ''
        return this._channel && this._channel.publish(this._name, '', buf, {
            persistent: false,
            expiration: 0,
            mandatory: false
        })
    }
}


function testAmqp() {
    let pub = new AmqpPublisher('amqp://localhost/', 'test')
    pub.connect().then(_ => {
        setInterval(_ => {
            pub.send(new Date().toISOString())
        }, 10)
    })
}

module.exports = AmqpPublisher
module.exports.testAmqp = testAmqp