const DEFAULT_SNAPSHOT_INTERVAL_MS = 60_000

let intervalHandle = null

function resolveIntervalMs(value = process.env.CONCURRENT_SNAPSHOT_INTERVAL_MS) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SNAPSHOT_INTERVAL_MS
}

function getCurrentSnapshot(onlineUsers, gameSnapshot) {
    if (!(onlineUsers instanceof Map)) throw new TypeError('onlineUsers must be a Map')
    if (!(gameSnapshot?.participantUuids instanceof Set)) {
        throw new TypeError('gameSnapshot.participantUuids must be a Set')
    }

    const total = onlineUsers.size
    let inGame = 0
    for (const uuid of onlineUsers.keys()) {
        if (gameSnapshot.participantUuids.has(uuid)) inGame += 1
    }

    return {
        total,
        lobby: total - inGame,
        in_game: inGame,
        room_count: gameSnapshot.room_count,
    }
}

async function captureConcurrentSnapshot({
    onlineUsers,
    getGameSnapshot,
    model,
    now = () => new Date(),
} = {}) {
    try {
        const current = getCurrentSnapshot(onlineUsers, getGameSnapshot())
        const ConcurrentSnapshot = model ?? require('../../../models').ConcurrentSnapshot
        await ConcurrentSnapshot.create({ captured_at: now(), ...current })
        return true
    } catch (error) {
        console.error('[동시 접속 스냅샷 저장 실패]', { code: 'CONCURRENT_SNAPSHOT_FAILED' })
        return false
    }
}

function startConcurrentSnapshotScheduler({
    onlineUsers,
    getGameSnapshot,
    model,
    now,
    intervalMs,
    setIntervalFn = setInterval,
} = {}) {
    if (intervalHandle !== null) return intervalHandle

    const tick = () => {
        void captureConcurrentSnapshot({ onlineUsers, getGameSnapshot, model, now })
    }
    intervalHandle = setIntervalFn(tick, resolveIntervalMs(intervalMs))
    if (typeof intervalHandle?.unref === 'function') intervalHandle.unref()
    return intervalHandle
}

function stopConcurrentSnapshotScheduler({ clearIntervalFn = clearInterval } = {}) {
    if (intervalHandle === null) return
    clearIntervalFn(intervalHandle)
    intervalHandle = null
}

module.exports = {
    DEFAULT_SNAPSHOT_INTERVAL_MS,
    resolveIntervalMs,
    getCurrentSnapshot,
    captureConcurrentSnapshot,
    startConcurrentSnapshotScheduler,
    stopConcurrentSnapshotScheduler,
}
