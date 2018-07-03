module.exports = {
    arrayUpdate: function arrayUpdate(array, eq, newValue) {
        const ret = array || []
        const index = ret.findIndex(eq)
        if (index === -1) {
            return [...ret, newValue]
        } else {
            return [
                ...ret.slice(0, index),
                newValue,
                ...ret.slice(index + 1)
            ]
        }
    },

    arrayRemove: function arrayRemove(arr, eq) {
        const ret = arr || []
        const index = ret.findIndex(eq)
        if (index === -1) {
            return ret
        } else {
            return [
                ret.slice(0, index),
                ret.slice(index + 1)
            ]
        }
    },

    arrayAdd: function arrayAdd(arr, eq, val) {
        const ret = arr || []
        const index = ret.findIndex(eq)
        if (index === -1) {
            return [...ret, val]
        } else {
            return ret
        }
    }
}