// 밤 행동 받기 파일
// 밤 행동 대상 받기, socket 쪽이 gameSession.js 통해서 사용
const { playerSession, gameSessions } = require('../../core/state')
const { isEligibleForNightAction, getCurrentNightTurnRole, requiresAliveTarget } = require('./actors')
const { isNightRoleCompleted } = require('./progress')
const { ROLE_TEAMS } = require('../../core/roles')
const { SELF_TARGET_ALLOWED_ROLES } = require('./constants')

// 밤 행동 대상 받기 (밤·산 사람·내 차례·대상 조건 맞을 때만)
// 광대가 광대를 고르면 성공처럼 답하지만 기록 안 함
function submitNightAction(uuid, gameId, targetId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }
    if (!isEligibleForNightAction(actor.role, session.dayIndex)) {
        return { ok: false, code: 'NOT_ELIGIBLE' }
    }
    const currentTurnRole = getCurrentNightTurnRole(session)
    if (currentTurnRole !== null && currentTurnRole !== actor.role) {
        return { ok: false, code: 'NOT_YOUR_TURN' }
    }
    if (isNightRoleCompleted(session, actor.role)) {
        return { ok: false, code: 'NOT_YOUR_TURN' }
    }

    if (targetId !== null) {
        const targetPlayer = session.players.get(targetId)
        if (!targetPlayer) return { ok: false, code: 'INVALID_TARGET' }
        if (requiresAliveTarget(actor.role)) {
            if (!targetPlayer.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        } else if (targetPlayer.alive) {
            return { ok: false, code: 'TARGET_NOT_DEAD' }
        }

        if (actor.role === 'JOKER' && ROLE_TEAMS[targetPlayer.role] === 'JOKER') {
            return { ok: true, gameId: session.id }
        }

        if (targetId === uuid && !SELF_TARGET_ALLOWED_ROLES.has(actor.role)) {
            return { ok: false, code: 'INVALID_TARGET' }
        }
    }

    session.nightActions.set(uuid, targetId)
    return { ok: true, gameId: session.id }
}

module.exports = {
    submitNightAction,
}
