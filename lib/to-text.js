module.exports = {
    guardLevel: val => {
        if (val === 3) return '舰长'
        if (val === 2) return '提督'
        if (val === 1) return '总督'
        return `未知${val}`
    }
}