// 역할 공개 확인 파일
// 역할 확인 버튼 받기 + 전원 확인됐는지
const { playerSession, gameSessions } = require('../core/state')
const { enterDayPhase } = require('../phase/day')
const { isParticipatingInSession } = require('../queries')

// "역할 확인" 누른 사람 기록, 전원 확인되면 첫 낮으로
function acknowledgeRoleReveal(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (session.phase !== 'ROLE_REVEAL') return { ok: false, code: 'INVALID_PHASE' }

    if (session.roleRevealAcks.has(uuid)) return { ok: true, transitioned: false, session }

    session.roleRevealAcks.add(uuid)
    if (isRoleRevealComplete(session)) {
        enterDayPhase(session)
        return { ok: true, transitioned: true, session }
    }
    return { ok: true, transitioned: false, session }
}

// 참여 중인 사람 전원 확인했는지
function isRoleRevealComplete(session) {
    const pending = [...session.players.values()].filter((player) => isParticipatingInSession(session, player.uuid))
    if (pending.length === 0) return false
    return pending.every((player) => session.roleRevealAcks.has(player.uuid))
}

module.exports = {
    acknowledgeRoleReveal,
    isRoleRevealComplete,
}