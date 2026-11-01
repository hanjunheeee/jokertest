// 요청 입구 확인 파일
// 판 id 정리 + 요청한 사람의 판·나 찾기, prepare/submit 함수들이 맨 앞에서 사용
const { gameSessions, playerSession } = require('./state')
const { assertSessionNotEnded } = require('../rules/terminal')

// 요청에 온 판 id 정리, 못 쓰는 값이면 빈 문자열
// trim 끄면 공백 안 자름 (낮 표·재판 표는 원래 안 자름)
function normalizeGameId(gameId, { trim = true } = {}) {
    if (typeof gameId !== 'string') return ''
    return trim ? gameId.trim() : gameId
}

// 정리된 판 id로 내 판·판 안의 나 찾기
// requireActor 끄면 사람 객체 말고 명단에 uuid 있는지만 봄
// checkEnded 켜면 끝난 판 거절까지 (함수마다 원래 하던 대로)
function findSessionForActor(uuid, normalizedGameId, { requireActor = true, checkEnded = false } = {}) {
    // 지금 내가 있는 판이랑 같은지 (옛 판 화면에서 보낸 것 거절)
    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    // 판이랑 판 안의 나 찾기
    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (requireActor ? !actor : !session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    // 끝난 판이면 거절
    if (checkEnded) {
        const endedCheck = assertSessionNotEnded(session)
        if (!endedCheck.ok) return endedCheck
    }
    return { ok: true, session, actor }
}

// 판 id 정리부터 내 판·나 찾기까지 한 번에
// 판 id랑 판 찾기 사이에 다른 검사 끼는 함수는 위 둘을 따로 부름
function findActorSession(uuid, gameId, { trim = true, requireActor = true, checkEnded = false } = {}) {
    // 요청에 온 판 id 확인
    const normalizedGameId = normalizeGameId(gameId, { trim })
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    return findSessionForActor(uuid, normalizedGameId, { requireActor, checkEnded })
}

module.exports = { normalizeGameId, findSessionForActor, findActorSession }
