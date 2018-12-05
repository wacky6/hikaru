const { BaseAmqp, exchangeOptions, subscribeQueueOptions } = require('./_amqp')

class AmqpSubscriber extends BaseAmqp {
    constructor(url, name) {
        super(url)
        this._name = name
    }

    _onChannel(ch) {
        return Promise.all([
            ch.assertExchange(this._name, 'fanout', exchangeOptions),
            ch.assertQueue('', subscribeQueueOptions).then(q => Promise.all([
                ch.bindQueue(q.queue, this._name, ''),
                ch.consume(q.queue, msg => this._onMessage(msg), { noAck: true }),
            ]))
        ])
    }

    _onMessage(msg) {
        msg && msg.content && this.emit('message', msg.content.toString('utf-8'))
    }
}

function testAmqp() {
    let sub = new AmqpSubscriber('amqp://localhost/', 'test')
    sub.connect()
    let count = 0
    sub.on('message', m => {
        count += 1
    })
    setInterval(_ => {
        console.log(`rx rate: ${count}/s`)
        count = 0
    }, 1000)
}

module.exports = AmqpSubscriber
module.exports.testAmqp = testAmqp