// 밤 판정 대장 파일
// prepare 결과 보관 + 입력 지문, commit 직전 바꿔치기 막기 (지도 06-⑥)
const { getNightProgress } = require('./progress')
const { NIGHT_TURN_ORDER } = require('./constants')
const { getParticipationRevision } = require('../../queries')

// 판정 결과 객체 → 준비할 때 기록 (밖에 안 내보냄)
const nightPreparations = new WeakMap()

// 밤 입력 지문: 누가 누구 골랐나 + 진행 기록 상태를 한 줄로
function computeNightInputFingerprint(session) {
    // 제출을 "누가>누구"로 적고 정렬 (넣은 순서 달라도 같은 지문)
    const submissions = []
    for (const [actorUuid, target] of session.nightActions ?? []) {
        submissions.push(`${actorUuid}>${target === null || target === undefined ? 'SKIP' : target}`)
    }
    submissions.sort()

    // 진행 기록: 차례 진행 여부·번호·치료 마감·끝난 역할
    const progress = getNightProgress(session)
    const progressPart = progress
        ? [
            progress.sequenced ? 'SEQ' : 'DIRECT',
            progress.revision,
            progress.healingClosed ? 'HEAL_CLOSED' : 'HEAL_OPEN',
            NIGHT_TURN_ORDER.filter((role) => progress.completedRoles.has(role)).join('+'),
        ].join('#')
        : 'NO_PROGRESS'

    return `${session.id}@${session.dayIndex}|${progressPart}|${submissions.join(',')}`
}

// Map·Set·배열·객체 깊은 복사
function cloneNightPreparationValue(value) {
    // 안에 든 값까지 하나씩 복사 (원본 고쳐도 복사본은 그대로)
    if (value instanceof Map) {
        const copy = new Map()
        for (const [key, nested] of value) copy.set(key, cloneNightPreparationValue(nested))
        return copy
    }
    if (value instanceof Set) return new Set(value)
    if (Array.isArray(value)) return value.map((item) => cloneNightPreparationValue(item))
    if (value !== null && typeof value === 'object') {
        const copy = {}
        for (const [key, nested] of Object.entries(value)) copy[key] = cloneNightPreparationValue(nested)
        return copy
    }
    return value
}

// 판정 결과 통째로 복사해 둠
function snapshotNightPreparation(resolution) {
    const snapshot = new Map()
    for (const key of Object.keys(resolution)) snapshot.set(key, cloneNightPreparationValue(resolution[key]))
    return snapshot
}

// 복사본으로 판정 결과 되돌림 (그사이 누가 고쳤어도 원래대로)
function restoreNightPreparation(resolution, snapshot) {
    // 준비 뒤에 몰래 붙은 칸은 지움
    for (const key of Object.keys(resolution)) {
        if (!snapshot.has(key)) delete resolution[key]
    }
    // 원래 칸은 복사본 값으로 덮어씀
    for (const [key, value] of snapshot) resolution[key] = cloneNightPreparationValue(value)
}

// 판정 결과를 대장에 등록 (판·날짜·참여 번호·지문·복사본)
function registerNightPreparation(session, resolution, { sequenced, progressRevision }) {
    // 키 = 판정 결과 객체라서 밖에서 비슷하게 만든 건 못 통과
    nightPreparations.set(resolution, {
        session,
        gameId: session.id,
        nightDayIndex: session.dayIndex,
        // 판에서 누가 빠질 때마다 오르는 번호
        participationRevision: getParticipationRevision(session),
        sequenced,
        progressRevision,
        inputFingerprint: computeNightInputFingerprint(session),
        pendingEliminationTargetId: resolution.pendingEliminationTargetId ?? null,
        prepared: snapshotNightPreparation(resolution),
        // commit 한 번 하면 true, 같은 준비로 두 번 확정 막기
        consumed: false,
    })
    return resolution
}

module.exports = {
    nightPreparations,
    computeNightInputFingerprint,
    cloneNightPreparationValue,
    snapshotNightPreparation,
    restoreNightPreparation,
    registerNightPreparation,
}
