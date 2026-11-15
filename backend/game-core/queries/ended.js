// 끝난 판 찾기 파일
// 끝난 판 남은 사람·결과 화면 닫힘 시각(판 끝 + 180초)·같은 방 자리 프로필, 매칭 쪽·판 끝 정리가 사용
const { gameSessions, playerSession } = require('../core/registry/state')
const { getActiveSessionRoutingInfo } = require('./live')
const { isForfeitedFromSession } = require('./participation')

// 끝난 판에 아직 남아 있는 사람의 판 id
function getEndedGameId(uuid) {
    // 판에 없거나 기권했으면 없음
    const routing = getActiveSessionRoutingInfo(uuid)
    if (!routing || isForfeitedFromSession(routing.gameId, uuid)) return null
    // 끝난 판일 때만 (진행 중 판은 아님)
    const session = gameSessions.get(routing.gameId)
    if (!session || session.phase !== 'ENDED') return null
    return session.id
}

// 결과 화면 머무는 시간 180초 (판 끝 시각부터 하나로 셈: 결과 화면 닫기·방장 자리·빈 방 지우기, 결정 [임시] 4)
const RESULT_SCREEN_MS = 180 * 1000

// 결과 화면 닫힘 시각 (판 끝 시각 + 180초, 끝난 판 아니면 null)
// 예: endedAt 1000000 → 1180000
function getResultClosesAt(session) {
    if (session?.phase !== 'ENDED' || !Number.isFinite(session.endedAt)) return null
    return session.endedAt + RESULT_SCREEN_MS
}

// 판 끝 칸·스냅샷에 결과 화면 닫힘 시각 붙이기 (끝난 판만, 값은 판 기록에서 매번 같게 계산)
// 예: { phase:'ENDED', winResult } → { phase:'ENDED', winResult, resultClosesAt: 1180000 }
function withResultClosesAt(session, fields) {
    const resultClosesAt = getResultClosesAt(session)
    if (resultClosesAt === null || !fields || typeof fields !== 'object') return fields
    return { ...fields, resultClosesAt }
}

// 아직 이 끝난 판에 묶인 사람 (결과 화면에 남은 사람, 기권·이미 나간 사람 빼고)
function getBoundEndedPlayerUuids(gameId) {
    const session = gameSessions.get(gameId)
    if (!session || session.phase !== 'ENDED') return []
    return [...session.players.keys()].filter((uuid) =>
        playerSession.get(uuid) === gameId && !isForfeitedFromSession(gameId, uuid))
}

// "대기방으로" 누른 사람의 방 자리 프로필 (판 시작 때 방에서 옮겨 온 값, DB 안 부름)
// 이 끝난 판에 아직 묶인 사람만, 아니면 null
// 예: → { nickname:'민수', accountProfilePhotoId: 3, accountProfileBorderId: null }
function getEndedSeatProfile(gameId, uuid) {
    if (getEndedGameId(uuid) !== gameId) return null
    const player = gameSessions.get(gameId)?.players.get(uuid)
    if (!player) return null
    return {
        nickname: player.nickname,
        accountProfilePhotoId: player.accountProfilePhotoId ?? null,
        accountProfileBorderId: player.accountProfileBorderId ?? null,
    }
}

// 끝난 판 남은 사람 목록 (기권한 사람 빼고)
function getEndedPlayerUuids(gameId, { excludeUuid = null } = {}) {
    // 끝난 판 아니면 빈 목록
    const session = gameSessions.get(gameId)
    if (!session || session.phase !== 'ENDED') return []
    // 뺄 사람(excludeUuid)·기권한 사람 건너뛰고 모음
    const uuids = []
    for (const uuid of session.players.keys()) {
        if (uuid === excludeUuid) continue
        if (isForfeitedFromSession(gameId, uuid)) continue
        uuids.push(uuid)
    }
    return uuids
}

module.exports = {
    getEndedGameId,
    getEndedPlayerUuids,
    RESULT_SCREEN_MS,
    getResultClosesAt,
    withResultClosesAt,
    getBoundEndedPlayerUuids,
    getEndedSeatProfile,
}