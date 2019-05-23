// TODO: does it work for node's stream pipe, network request stream
const isRealtimeStream = (rs) => {
    return !rs.path
}

// nop budget, will process all frames
// use for fs.ReadStream
class BudgetForFile {
    constructor() {}
    markProcessStartForPts() {}
    markProcessEndForPts() {}
    markSkippedPts() {}
    shouldSkipPts() { return false }
    skippedFrames() { return 0 }
}

// determine whether to skip frame based on previous processing time
// use for non fs.ReadStream
class BudgetForRealtime {
    constructor() {
        this.budgetRequired = 0
        this.startTime = 0
        this.curPts = 0
        this.skippedFrames = 0
    }
    markProcessStartForPts(pts, now = Date.now()) {
        this.curPts = pts
        this.startTime = now
    }
    markProcessEndForPts(now = Date.now()) {
        const historyWeight = 0.3
        const elapsedTime = now - this.startTime
        this.budgetRequired = this.budgetRequired ? this.budgetRequired * historyWeight + elapsedTime * (1-historyWeight) : elapsedTime
        return elapsedTime
    }
    markSkippedPts() {
        this.skippedFrames += 1
    }
    shouldSkipPts(pts) {
        const tolerance = 0.9
        const availableBudget = Math.max(1, 1000 * tolerance * (pts - this.curPts))
        return this.budgetRequired ? this.budgetRequired > availableBudget : false
    }
    skippedFrames() {
        return this.skippedFrames
    }
}

function createBudgetForStream(rs) {
    if (isRealtimeStream(rs)) {
        return new BudgetForRealtime()
    } else {
        return new BudgetForFile()
    }
}

module.exports = {
    BudgetForFile,
    BudgetForRealtime,
    isRealtimeStream,
    createBudgetForStream
}
