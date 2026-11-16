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

// 이 역할 밤 판정에 고름이 들어가는 사람: 산 사람 + 고른 뒤 판에서 빠진 사람
// 빠진 사람이 이미 낸 고름은 남음 (보호를 고른 의사·암살을 고른 광대가 탈락해도 남음, 사용자 결정 2026-11-16)
// 밤에 죽는 길은 판에서 빠지는 것뿐이라, 죽었는데 고름이 남아 있으면 고른 뒤 빠진 사람
// 예 광대 j1이 X를 고르고 나감, j2는 남음 → ['j2', 'j1']
function getRoleNightDeciderUuids(session, role) {
    const uuids = getAliveActorUuidsForRole(session, role)
    for (const actorUuid of session.nightActions.keys()) {
        const player = session.players.get(actorUuid)
        if (!player || player.alive === true || player.role !== role) continue
        uuids.push(actorUuid)
    }
    return uuids
}

// 이 판 오늘 밤 차례 (판에 없는 역할·오늘 밤 행동 못 하는 역할은 뺌)
// 마녀사냥꾼은 첫날 밤 차례 자체를 건너뜀 (차례 안내 방송 안 나감, 사용자 결정 2026-11-09)
function getNightTurnOrder(session) {
    const order = filterComposedRoles(session?.roleComposition)
    const dayIndex = session?.dayIndex
    if (!Number.isInteger(dayIndex)) return order
    return Object.freeze(order.filter((role) => isEligibleForNightAction(role, dayIndex)))
}

// 역할 구성에 한 명 이상 있는 역할만 (구성 기록 없거나 다 빠지면 기본 순서)
function filterComposedRoles(composition) {
    if (!composition || typeof composition !== 'object') return NIGHT_TURN_ORDER
    const order = NIGHT_TURN_ORDER.filter((role) => Number.isInteger(composition[role]) && composition[role] > 0)
    return order.length > 0 ? order : NIGHT_TURN_ORDER
}

// 이 역할 산 사람 전부 냈는지 (빠진 사람은 더 못 내니 안 셈)
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
    getRoleNightDeciderUuids,
    getNightTurnOrder,
    isRoleTurnComplete,
    getCurrentNightTurnRole,
}
