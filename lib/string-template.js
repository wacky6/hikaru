module.exports = function processStringTemplate(template, args = {}) {
    return template.replace(/(@[a-z]+)/g, function(m) {
        return args[m.slice(1)] || ''
    })
}