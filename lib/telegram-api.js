const axios = require('axios')
const RESPONSE_DEADLINE = 10000    // 10s deadline

module.exports = {
    sendMessage: (botApi, args) => axios.post(
        `${botApi}/sendMessage`,
        args,
        { timeout: RESPONSE_DEADLINE, reponseType: 'json' }
    ).then(resp => ({
        messageId: resp.data.message_id,
        chat: resp.data.chat
    })),
    editMessageText: (botApi, args) =>  axios.post(
        `${botApi}/editMessageText`,
        args,
        { timeout: RESPONSE_DEADLINE, reponseType: 'json' }
    ).then(body => ({
        messageId: body.data.message_id,
        chatId: body.data.chat_id
    }))
}