module.exports = function parseTelegramToken(str) {
    if (!str) return null

    const segments = str.split(':')
    if (segments.length !== 3) {
        throw new Error('Invalid telegram token format, expect: <token>:<chat_id>')
    }

    return {
        token: segments.slice(0, 2).join(':'),
        chatId: parseInt(segments[2], 10)
    }
}