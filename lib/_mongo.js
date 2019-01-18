const { MongoClient } = require('mongodb')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const DEFAULT_MONGODB = process.env['HIKARU_DEFAULT_MONGO'] || 'mongodb://localhost/hikaru'

/*
 * Wrapped Mongodb Client that automatically handles failure
 */
class MongoDump {
    constructor(connStr = DEFAULT_MONGODB) {
        this._connStr = connStr
        this._conn = null
        this._canSend = false
        this._closed = false    // closed externally
        this._connecting = false
        this.connect()
        this.errorHandler = (err) => {
            this.close(false)
            sleep(1000).then(_ => this.connect())
            return false
        }
    }

    connect() {
        if (this._connecting) return this._connecting
        if (this._conn) return Promise.resolve(this._conn)
        if (this._closed) return Promise.resolve(null)

        return this._connecting = MongoClient.connect(
            this._connStr,
            { useNewUrlParser: true }
        ).then(
            conn => {
                console.error(`mongo: connection established: ${this._connStr}`)
                this._conn = conn
                this._canSend = true
                this._connecting = null
                return this._conn
            },
            err => {
                this._conn = null
                this._canSend = false
                return sleep(1000).then(_ => {
                    this._connecting = null
                    return this.connect()
                })
            }
        )
    }

    connectWithTimeout(ms = 5000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(_ => {
                reject(new Error('Timeout'))
            }, ms).unref()

            this.connect().then(conn => {
                clearTimeout(timeout)
                resolve(conn)
            })
        })
    }

    close(closed = true) {
        this._conn && this._conn.close({force: true})
        this._conn = null
        this._canSend = false
        this._closed = closed
    }

    getConn() {
        return this.connect()
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