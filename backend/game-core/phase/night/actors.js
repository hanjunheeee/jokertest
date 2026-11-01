// 밤 행동 자격 파일
// 밤 행동 자격 + 역할 차례 순서·끝났는지, 밤 코드·socket 쪽이 사용
const { ROLE_DEFINITIONS } = require('../../core/rules/roles')
const { NIGHT_TURN_ORDER } = require('./constants')

// 이 역할이 오늘 밤 행동할 수 있는 날인지 (마녀사냥꾼은 둘째 밤부터)
function isEligibleForNightAction(role, dayIndex) {
    const minDayIndex = ROLE_DEFINITIONS[role]?.nightActionMinDayIndex
    return minDayIndex !== null && minDayIndex !== undefined && dayIndex >= minDayIndex
}

// 대상이 살아 있어야 하는 역할인지 (마녀사냥꾼만 죽은 사람 고름)
function requiresAliveTarget(role) {
    return ROLE_DEFINITIONS[role]?.targetMustBeAlive !== false
}

// 고른 대상 생사가 역할 규칙에 맞는지 (보통은 산 사람, 마녀사냥꾼은 죽은 사람)
// 역할 차례 끝내기·한 번에 판정 준비가 같은 규칙으로 다시 확인
function matchesTargetLifeRule(role, targetPlayer) {
    return requiresAliveTarget(role) ? targetPlayer.alive === true : targetPlayer.alive !== true
}

// 오늘 밤 행동할 산 사람 전부
function getEligibleNightActorUuids(session) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive !== true) continue
        if (isEligibleForNightAction(player.role, session.dayIndex)) uuids.push(player.uuid)
    }
    return uuids
}

// 그중 이 역할인 사람
function getAliveActorUuidsForRole(session, role) {
    return getEligibleNightActorUuids(session).filter((uuid) => session.players.get(uuid)?.role === role)
}

// 이 판 밤 차례 (판에 없는 역할은 뺌)
function getNightTurnOrder(session) {
    // 역할 구성 기록이 없으면 기본 순서 그대로
    const composition = session?.roleComposition
    if (!composition || typeof composition !== 'object') return NIGHT_TURN_ORDER
    // 한 명 이상 있는 역할만 남김, 다 빠지면 기본 순서
    const order = NIGHT_TURN_ORDER.filter((role) => Number.isInteger(composition[role]) && composition[role] > 0)
    return order.length > 0 ? Object.freeze(order) : NIGHT_TURN_ORDER
}

// 이 역할 사람 전부 냈는지
function isRoleTurnComplete(session, role) {
    for (const actorUuid of getAliveActorUuidsForRole(session, role)) {
        if (!session.nightActions.has(actorUuid)) return false
    }
    return true
}

// 지금 차례 역할 (차례 없으면 null)
function getCurrentNightTurnRole(session) {
    return session.nightTurnRole ?? null
}

module.exports = {
    isEligibleForNightAction,
    requiresAliveTarget,
    matchesTargetLifeRule,
    getEligibleNightActorUuids,
    getAliveActorUuidsForRole,
    getNightTurnOrder,
    isRoleTurnComplete,
    getCurrentNightTurnRole,
}
