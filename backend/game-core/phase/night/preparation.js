// 밤 판정 대장 파일
// prepare 결과 보관 + 입력 지문, commit 직전 바꿔치기 막기 (지도 06-⑥)
const { getNightProgress } = require('./progress')
const { NIGHT_TURN_ORDER } = require('./constants')

// 판정 결과 객체 → 준비할 때 기록 (밖에 안 내보냄)
const nightPreparations = new WeakMap()

// 밤 입력 지문: 누가 누구 골랐나 + 진행 기록 상태를 한 줄로
function computeNightInputFingerprint(session) {
    const submissions = []
    for (const [actorUuid, target] of session.nightActions ?? []) {
        submissions.push(`${actorUuid}>${target === null || target === undefined ? 'SKIP' : target}`)
    }
    submissions.sort()

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
    for (const key of Object.keys(resolution)) {
        if (!snapshot.has(key)) delete resolution[key]
    }
    for (const [key, value] of snapshot) resolution[key] = cloneNightPreparationValue(value)
}

// 판정 결과를 대장에 등록 (판·날짜·참여 번호·지문·복사본)
function registerNightPreparation(session, resolution, { sequenced, progressRevision }) {
    nightPreparations.set(resolution, {
        session,
        gameId: session.id,
        nightDayIndex: session.dayIndex,
        participationRevision: Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0,
        sequenced,
        progressRevision,
        inputFingerprint: computeNightInputFingerprint(session),
        pendingEliminationTargetId: resolution.pendingEliminationTargetId ?? null,
        prepared: snapshotNightPreparation(resolution),
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
