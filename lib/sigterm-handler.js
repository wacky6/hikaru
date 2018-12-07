module.exports = function(cbk = _ => null) {
    process.on('SIGTERM', () => {
        cbk()
        process.exit()
    })
}