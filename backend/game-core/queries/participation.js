// 참여 확인 파일
// 기권했는지·아직 참여 중인지 + 참여 번호 읽기, 판 찾기·밤 판정·나가기가 사용
const { gameSessions } = require('../core/state')

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
    isParticipatingInSession,
    getParticipationRevision,
}
