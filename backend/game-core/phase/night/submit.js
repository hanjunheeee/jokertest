// 밤 행동 받기 파일
// 밤 행동 대상 받기, socket 쪽이 gameSession.js 통해서 사용
const { findActorSession } = require('../../core/registry/lookup')
const { isEligibleForNightAction, getCurrentNightTurnRole, requiresAliveTarget } = require('./actors')
const { isNightRoleCompleted } = require('./progress')
const { ROLE_TEAMS } = require('../../core/rules/roles')
const { SELF_TARGET_ROLES } = require('./constants')

// 밤 행동 대상 받기 (밤·산 사람·내 차례·대상 조건 맞을 때만)
// 광대가 광대를 고르면 성공처럼 답하지만 기록 안 함
function submitNightAction(uuid, gameId, targetId) {
    // 판 id 확인 + 내 판·판 안의 나 찾기 (옛 판 화면에서 보낸 것 거절)
    const found = findActorSession(uuid, gameId)
    if (!found.ok) return found
    const { session, actor } = found

    // 밤일 때만, 이미 판정 끝난 밤이면 거절 (지도 05-⑤)
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    // 산 사람만, 오늘 밤 행동 있는 역할만 (지도 05-③)
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }
    if (!isEligibleForNightAction(actor.role, session.dayIndex)) {
        return { ok: false, code: 'NOT_ELIGIBLE' }
    }
    // 지금 차례가 내 역할 아니면 거절
    const currentTurnRole = getCurrentNightTurnRole(session)
    if (currentTurnRole !== null && currentTurnRole !== actor.role) {
        return { ok: false, code: 'NOT_YOUR_TURN' }
    }
    // 이미 확정된 역할이 늦게 또 낸 것 거절
    if (isNightRoleCompleted(session, actor.role)) {
        return { ok: false, code: 'NOT_YOUR_TURN' }
    }

    // 대상 검사 (null = 건너뛰기라 검사 없음) (지도 05-④)
    if (targetId !== null) {
        // 판에 없는 사람이면 거절
        const targetPlayer = session.players.get(targetId)
        if (!targetPlayer) return { ok: false, code: 'INVALID_TARGET' }
        // 보통은 산 사람만, 마녀사냥꾼은 반대로 죽은 사람만
        if (requiresAliveTarget(actor.role)) {
            if (!targetPlayer.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        } else if (targetPlayer.alive) {
            return { ok: false, code: 'TARGET_NOT_DEAD' }
        }

        // 광대가 광대(나 포함) 찍으면 기록 없이 ok만
        if (actor.role === 'JOKER' && ROLE_TEAMS[targetPlayer.role] === 'JOKER') {
            return { ok: true, gameId: session.id }
        }

        // 자기 자신은 의사만 고를 수 있음
        if (targetId === uuid && !SELF_TARGET_ROLES.has(actor.role)) {
            return { ok: false, code: 'INVALID_TARGET' }
        }
    }

    // 여기부터 진짜 바뀜: 내 대상 기록 (다시 내면 덮어씀)
    session.nightActions.set(uuid, targetId)
    return { ok: true, gameId: session.id }
}

module.exports = {
    submitNightAction,
}
