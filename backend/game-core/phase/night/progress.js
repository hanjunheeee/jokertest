// 밤 진행 기록 파일
// 오늘 밤 진행 기록 만들기·찾기 + 역할 끝났는지·회복 막힘 상태 확인
const { NIGHT_RECOVERY_STATES } = require('./constants')
const { gameSessions } = require('../../core/state')

// 치료 기다리는 중이거나 죽을 예정이면 행동 막힘
function isRecoveryBlockedState(state) {
    return state === NIGHT_RECOVERY_STATES.PENDING_RECOVERY || state === NIGHT_RECOVERY_STATES.DEATH_CANDIDATE
}

// 오늘 밤 진행 기록 새로 (끝난 역할·차례 결과·사건·회복 상태)
function createNightProgress(session, { sequenced = false } = {}) {
    return {
        gameId: session.id,
        nightDayIndex: session.dayIndex,
        revision: 0,
        sequenced,
        completedRoles: new Set(),
        roleSteps: [],
        events: [],
        recoveryStates: new Map(),
        roleTargets: new Map(),
        healingClosed: false,
    }
}

// 이 기록이 지금 판·오늘 밤 것인지
function matchesCurrentNight(session, progress) {
    return !!progress
        && progress.gameId === session.id
        && progress.nightDayIndex === session.dayIndex
}

// 오늘 밤 기록 꺼내기 (지난 밤 것이면 null)
function getNightProgress(session) {
    return matchesCurrentNight(session, session?.nightProgress) ? session.nightProgress : null
}

// 오늘 밤 기록 없으면 만들고 꺼내기
function ensureNightProgress(session, { sequenced = false } = {}) {
    let progress = getNightProgress(session)
    if (!progress) {
        progress = createNightProgress(session, { sequenced })
        session.nightProgress = progress
    }
    if (sequenced) progress.sequenced = true
    return progress
}

// 이 밤은 차례대로 진행한다고 표시
function markNightSequenced(session) {
    if (!session || typeof session.id !== 'string') return false
    if (gameSessions.get(session.id) !== session) return false
    if (session.phase !== 'NIGHT') return false
    if (session.nightResolution !== null) return false
    ensureNightProgress(session, { sequenced: true })
    return true
}

// 차례 진행 중 이 역할 이미 끝났는지
function isNightRoleCompleted(session, role) {
    const progress = getNightProgress(session)
    return !!progress && progress.sequenced && progress.completedRoles.has(role)
}

module.exports = {
    isRecoveryBlockedState,
    createNightProgress,
    matchesCurrentNight,
    getNightProgress,
    ensureNightProgress,
    markNightSequenced,
    isNightRoleCompleted,
}
