module.exports = function writeTtyStatLine(line) {
    if (process.stdout.isTTY) {
        process.stdout.clearLine(0)
        process.stdout.cursorTo(0)
        process.stdout.write(line)
    }
}