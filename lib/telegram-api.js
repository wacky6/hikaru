const agent = require('superagent')

const tryJSON = resp => {
    try {
        return JSON.parse(resp.text)
    } catch(e) {
        return null
    }
}

const unwrapResp = resp => {
    // unwrap superagent http resp
    if (resp.ok) {
        // unwrap RESTful response
        // API may return text/html for JSON
        const body = tryJSON(resp) || resp.body
        if (body.ok) {
            return body.result
        } else {
            throw new Error(`API Failed: ${resp.req.path} -> ${body.error_code || ''} - ${body.description || ''}`)
        }
    } else {
        throw new Error(`API Failed: ${resp.req.path} -> non-success http status: ${resp.status}, ${resp.body}`)
    }
}

module.exports = {
    sendMessage: (botApi, args) => agent
        .post(`${botApi}/sendMessage`)
        .send(args)
        .then(unwrapResp)
        .then(body => ({
            messageId: body.message_id,
            chat: body.chat
        }))
    ,
    editMessageText: (botApi, args) => agent
        .post(`${botApi}/editMessageText`)
        .send(args)
        .then(unwrapResp)
        .then(body => ({
            messageId: body.message_id,
            chatId: body.chat_id
        }))
}