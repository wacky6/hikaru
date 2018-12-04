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
    sub.on('message', m => console.log(m))
}

module.exports = AmqpSubscriber
module.exports.testAmqp = testAmqp