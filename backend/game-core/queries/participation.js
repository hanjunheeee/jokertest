// 참여 확인 파일
// 기권·참여 중인지 + 참여 번호, 판 찾기·밤 판정·나가기·역할 확인·socket이 사용
const { gameSessions, playerSession } = require('../core/registry/state')

// 이 판 기권 명단에 있는지 (명단 없으면 아님)
function hasForfeited(session, uuid) {
    return session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)
}

// 기권한 사람인지
function isForfeitedFromSession(gameId, uuid) {
    const session = gameSessions.get(gameId)
    if (!session) return false
    return hasForfeited(session, uuid)
}

// 이 판에서 스스로 나간 사람인지 (게임 나가기·죽은 뒤 로비로, 명단 없으면 아님)
function hasLeftByChoice(session, uuid) {
    return session.leftByChoiceUuids instanceof Set && session.leftByChoiceUuids.has(uuid)
}

// 끊겨 60초 못 돌아와 빠진 사람인지 (기권 명단엔 있고 스스로 나간 건 아님) → 스냅샷 답 "끊겨 제외" 글 줄 사람
// 스스로 나간 사람은 자기가 나간 것을 알아서 그 글을 안 줌 (반장 결정 2026-11-16)
function isForfeitNoticeDue(gameId, uuid) {
    const session = gameSessions.get(gameId)
    if (!session) return false
    return hasForfeited(session, uuid) && !hasLeftByChoice(session, uuid)
}

// 지금 열려 있는 판 중 이 사람이 끊겨 빠진 판이 있는지 (스스로 나간 판은 뺌)
// 판 번호 없이 스냅샷을 물을 때만 씀 (새로고침한 화면은 판 번호를 모름), 열린 판 수만큼만 훑음
function isForfeitedFromAnySession(uuid) {
    for (const gameId of gameSessions.keys()) {
        if (isForfeitNoticeDue(gameId, uuid)) return true
    }
    return false
}

// 이 판에서 스스로 나간 뒤 아무 판에도 없는 사람인지 → 그 판 스냅샷을 물으면 "그 판에 없음"으로 답함
// 숨기면(INTERNAL_ERROR) 화면 나가기 결과 확인이 "결과 모름"에 머묾, socket 스냅샷 핸들러가 씀
function hasLeftSessionByChoice(gameId, uuid) {
    const session = gameSessions.get(gameId)
    if (!session || playerSession.has(uuid)) return false
    return hasLeftByChoice(session, uuid)
}

// 아직 판에 참여 중인지 (빠졌거나 기권했으면 아님)
function isParticipatingInSession(session, uuid) {
    // 판에 없거나, 나가서 빠졌거나, 기권했으면 아님
    const player = session?.players?.get(uuid)
    if (!player) return false
    if (player.isParticipating === false) return false
    if (hasForfeited(session, uuid)) return false
    return true
}

// 판의 참여 번호 (누가 빠질 때마다 +1, 이상한 값이면 0)
// 밤 판정 대장·밤 확정·게임 중 나가기가 같은 규칙으로 읽기
function getParticipationRevision(session) {
    return Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0
}

module.exports = {
    hasForfeited,
    isForfeitedFromSession,
    isForfeitNoticeDue,
    isForfeitedFromAnySession,
    hasLeftSessionByChoice,
    isParticipatingInSession,
    getParticipationRevision,
}
