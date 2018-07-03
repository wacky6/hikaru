const { parse: parseUrl } = require('url')
const { basename } = require('path')

module.exports = {
    parseRoom: str => {
        if (typeof str !== 'string') throw new Error('Room must be string-like')

        // if string is number like, return as is
        if (String(Number(str)) === str) return str

        // parse as url
        if (str.includes('live.bilibili.com')) return basename(parseUrl(str).pathname)

        // throw
        throw new Error('Room can not be identified')
    }
}