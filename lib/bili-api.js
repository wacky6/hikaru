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
        if (body.code === 0 && body.data) {
            return body.data
        } else {
            throw new Error(`API Failed: ${resp.req.path} -> ${body.code} - ${body.message || ''} - ${body.msg || ''}`)
        }
    } else {
        throw new Error(`API Failed: ${resp.req.path} -> non-success http status: ${resp.status}, ${resp.body}`)
    }
}

const transformGenderResp = val => {
    if (val === 1) return 'male'
    if (val === 2) return 'female'
    return null
}

const RESPONSE_DEADLINE = 10000    // 10s deadline

module.exports = {
    autoRetry: (fn, ...args) => {
        const autoRetryWrap = () =>
            Promise.resolve(fn(...args)).then(
                ret => ret,
                err => {
                    console.error(err)
                    autoRetryWrap()
                }
            )
        return autoRetryWrap()
    },

    // get room info (live status)
    getRoomInfo: roomid => agent
        .get(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomid}`)
        .timeout(RESPONSE_DEADLINE)
        .then(unwrapResp)
        .then(body => ({
            uid: body.uid,                    // user id
            roomId: body.room_id,             // canonical room id (for subsequent requests)
            shortId: body.short_id,           // short id
            liveStatus: body.live_status,     // live status, 1 = on air
            liveStartsAt: body.live_time,     // live start time, format = `yyyy-MM-dd hh:mm:ss`, tz +8
            title: body.title,                // live title
            primaryAreaId: body.parent_area_id,     // primary area id
            primaryAreaName: body.parent_area_name,     // primary area text
            coverUrl: body.user_cover,    // cover image url
            tags: body.tags,
        })),

    // get room user, actually room's anchor
    getRoomUser: roomid => agent
        .get(`https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=${roomid}`)
        .timeout(RESPONSE_DEADLINE)
        .then(unwrapResp)
        .then(body => ({
            uid: body.info.uid,                // user id
            name: body.info.uname,             // user name
            gender: transformGenderResp(body.info.gender),    // user gender
            avatarUrl: body.info.face,          // avatar image
            level: body.info.platform_user_level, // site level
            liveLevel: body.level && body.level.user_level,     // live user level
            liveHostLevel: body.level && body.level.master_level && body.level.master_level.level,    // live host level
            vipType: body.info.vip_type
        })),

    // quality = 4 appears to mean raw (原画), works even if not logged in
    getPlayUrls: roomid => agent
        .get(`https://api.live.bilibili.com/room/v1/Room/playUrl?cid=${roomid}&quality=4&platform=web`)
        .timeout(RESPONSE_DEADLINE)
        .then(unwrapResp)
        .then(body => ({
            quality: body.current_quality,     // quality number
            urls: body.durl.map(entry => ({    // -> array
                order: entry.order,            //    order: ?, likely be used in (轮播)
                url: entry.url,                //    url: cdn url, should be passed to curl / downloader
            }))
        })),

    getDanmakuConf: (roomid) => agent
        .get(`https://api.live.bilibili.com/room/v1/Danmu/getConf?room_id=${roomid}`)
        .timeout(RESPONSE_DEADLINE)
        .then(unwrapResp)
        .then(body => ({
            servers: body.host_server_list
        }))
}