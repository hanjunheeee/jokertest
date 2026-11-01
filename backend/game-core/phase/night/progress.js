// 밤 진행 기록 파일
// 오늘 밤 진행 기록 만들기·찾기·확인, 밤 코드·socket 쪽이 사용
const { NIGHT_RECOVERY_STATES } = require('./constants')
const { isRegisteredSession } = require('../../queries/byId')

// 치료 기다리는 중이거나 죽을 예정이면 행동 막힘
function isRecoveryBlockedState(state) {
    return state === NIGHT_RECOVERY_STATES.PENDING_RECOVERY || state === NIGHT_RECOVERY_STATES.DEATH_CANDIDATE
}

// 오늘 밤 진행 기록 새로 (끝난 역할·차례 결과·사건·회복 상태)
function createNightProgress(session, { sequenced = false } = {}) {
    return {
        // 어느 판·어느 밤 기록인지 (지난 밤 기록 섞임 막기)
        gameId: session.id,
        nightDayIndex: session.dayIndex,
        // 바뀔 때마다 오르는 번호, 판정 commit이 비교함
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
    // 없거나 지난 밤 것이면 새 기록으로 갈아 끼움
    let progress = getNightProgress(session)
    if (!progress) {
        progress = createNightProgress(session, { sequenced })
        session.nightProgress = progress
    }
    // 차례 진행 표시는 켜기만 함 (한 번 켜면 안 끔)
    if (sequenced) progress.sequenced = true
    return progress
}

// 이 밤은 차례대로 진행한다고 표시
function markNightSequenced(session) {
    // 진짜 판 장부에 있는 그 판인지
    if (!isRegisteredSession(session)) return false
    // 아직 판정 안 끝난 밤일 때만
    if (session.phase !== 'NIGHT') return false
    if (session.nightResolution !== null) return false
    // 여기부터 진짜 바뀜: 차례 진행 표시 켬
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
