const { MongoClient } = require('mongodb')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const DEFAULT_MONGODB = process.env['HIKARU_DEFAULT_MONGO'] || 'mongodb://localhost/hikaru'

/*
 * Wrapped Mongodb Client that automatically handles failure
 */
class MongoDump {
    constructor(connStr = DEFAULT_MONGODB, collection = 'danmaku') {
        this._connStr = connStr
        this._conn = null
        this._canSend = false
        this._closed = false    // closed externally
        this._connecting = false
        this._collection = collection
        this.connect()
    }

    connect() {
        if (this._conn || this._connecting || this._closed) return
        this._connecting = true
        return MongoClient.connect(this._connStr, { useNewUrlParser: true }).then(
            conn => {
                console.error(`mongo: connection established: ${this._connStr}`)
                this._conn = conn
                this._canSend = true
                this._connecting = false
                return true
            },
            err => {
                this._conn = null
                this._canSend = false
                return sleep(1000).then(_ => {
                    this._connecting = false
                    this.connect()
                })
            }
        )
    }

    close(closed = true) {
        this._conn && this._conn.close({force: true})
        this._conn = null
        this._canSend = false
        this._closed = closed
    }

    send(payload) {
        if (!this._canSend) return

        return this._conn.db().collection(this._collection).insertOne(payload).then(
            _ => true,
            err => {
                this.close(false)
                sleep(1000).then(_ => this.connect())
                return false
            }
        )
    }
}

function testMongoDump() {
    const md = new MongoDump(DEFAULT_MONGODB)
    setInterval(_ => {
        md.send({
            rnd: Date.now()
        })
    }, 1000)
}

module.exports = {
    MongoDump,
    defaultMongodbConnection: DEFAULT_MONGODB,
    testMongoDump,
}