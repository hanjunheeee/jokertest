// 동시 접속 스냅샷 파일, 지금 접속 수 세기 + 한 줄 저장
// scheduler.js가 주기마다 부르고, 입구(index.js) 거쳐 시험도 바로 부름
const snapshotRepository = require('../../../repositories/presence/concurrentSnapshot')

// 접속 Map·판 참가자 Set으로 로비/게임 중 수 나눠 셈
function getCurrentSnapshot(onlineUsers, gameSnapshot) {
    // 모양 틀린 입력은 바로 던짐 (captureSnapshot이 받아 false로)
    if (!(onlineUsers instanceof Map)) throw new TypeError('onlineUsers must be a Map')
    if (!(gameSnapshot?.participantUuids instanceof Set)) {
        throw new TypeError('gameSnapshot.participantUuids must be a Set')
    }

    // 접속 중이면서 판 참가자면 게임 중, 나머지는 로비
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
async function captureSnapshot({
    onlineUsers,
    getGameSnapshot,
    model,
    now = () => new Date(),
} = {}) {
    try {
        const current = getCurrentSnapshot(onlineUsers, getGameSnapshot())
        await snapshotRepository.saveSnapshot({ captured_at: now(), ...current }, { model })
        return true
    } catch {
        console.error('[동시 접속 스냅샷 저장 실패]', { code: 'CONCURRENT_SNAPSHOT_FAILED' })
        return false
    }
}

module.exports = {
    getCurrentSnapshot,
    captureSnapshot,
}
