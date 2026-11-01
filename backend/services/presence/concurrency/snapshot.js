// 동시 접속 스냅샷 파일, 지금 접속 수 세기 + 한 줄 저장
// 주기 켜기(scheduler)가 부르고 시험도 바로 부름

// 접속 Map·판 참가자 Set으로 로비/게임 중 수 나눠 셈
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

// 저장 실패해도 던지지 않고 false (주기 작업이 안 멈추게)
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

module.exports = {
    getCurrentSnapshot,
    captureConcurrentSnapshot,
}
