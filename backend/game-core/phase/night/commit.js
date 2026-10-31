// 밤 확정 파일
// 밤 판정 확정 + 사망 공개 내용, 확정 뒤 승패 판정·낮으로
const { PUBLIC_NIGHT_DEATH_SOURCES, NIGHT_TURN_ORDER } = require('./constants')
const { isObserverBusy, observeNightCommit } = require('../../core/observer')
const { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession } = require('../../core/terminal')
const { nightPreparations, computeNightInputFingerprint, restoreNightPreparation } = require('./preparation')
const { gameSessions } = require('../../core/state')
const { getNightProgress } = require('./progress')
const { isParticipatingInSession } = require('../../queries')
const { DEATH_REASONS } = require('../../result')
const { enterDayPhase } = require('../day')

// 죽은 이유 하나로 정하기 (둘 이상이면 모름)
function resolveNightDeathSource(resolution, victimUuid) {
    const attributions = []
    if (resolution?.assassinationTargetId === victimUuid) attributions.push(PUBLIC_NIGHT_DEATH_SOURCES.JOKER)
    if (resolution?.witchHunterExecutionTargetId === victimUuid) {
        attributions.push(PUBLIC_NIGHT_DEATH_SOURCES.WITCH_HUNTER)
    }
    return attributions.length === 1 ? attributions[0] : PUBLIC_NIGHT_DEATH_SOURCES.UNKNOWN_NIGHT
}

// 밤 사망 공개 목록 (중복 빼고)
function buildNightDeathReveals(resolution, victimUuids) {
    const reveals = [] 
    const seen = new Set()
    for (const victimUuid of victimUuids) {
        if (typeof victimUuid !== 'string' || victimUuid.length === 0) continue
        if (seen.has(victimUuid)) continue
        seen.add(victimUuid)
        reveals.push({ victimUuid, source: resolveNightDeathSource(resolution, victimUuid) })
    }
    return reveals
}

// 죽은 사람이 낸 밤 행동 지움
function expireDeadPlayerNightEffects(session, deadUuids) {
    const expired = []
    for (const uuid of deadUuids) {
        if (!session.nightActions.has(uuid)) continue
        session.nightActions.delete(uuid)
        expired.push(uuid)
    }
    return expired
}

// 밤 확정: 대장 기록·지문 그대로인지 보고 사망 처리, 승패 나면 판 닫고 아니면 낮으로
function commitNightResolution(session, resolution) {
    if (isObserverBusy()) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck 

    const record = (resolution !== null && typeof resolution === 'object')
        ? nightPreparations.get(resolution)
        : undefined
    if (!record) return { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' }
    if (record.session !== session) return { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' }
    if (record.consumed) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (record.gameId !== session.id) return { ok: false, code: 'STALE_RESOLUTION' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (record.nightDayIndex !== session.dayIndex) return { ok: false, code: 'STALE_RESOLUTION' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    const currentParticipationRevision =
        Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0
    if (currentParticipationRevision !== record.participationRevision) return { ok: false, code: 'STALE_RESOLUTION' }

    if (record.inputFingerprint !== computeNightInputFingerprint(session)) {
        return { ok: false, code: 'STALE_RESOLUTION' }
    }

    if (record.sequenced) {
        const progress = getNightProgress(session)
        if (!progress || progress.sequenced !== true) return { ok: false, code: 'STALE_RESOLUTION' }
        if (progress.revision !== record.progressRevision) return { ok: false, code: 'STALE_RESOLUTION' }
        if (!progress.healingClosed) return { ok: false, code: 'ACTIONS_PENDING' }
        for (const role of NIGHT_TURN_ORDER) {
            if (!progress.completedRoles.has(role)) return { ok: false, code: 'ACTIONS_PENDING' }
        }
    }

    let victimUuid = record.pendingEliminationTargetId ?? null
    if (victimUuid !== null && session.players.has(victimUuid) && !isParticipatingInSession(session, victimUuid)) {
        victimUuid = null
    }

    let victim = null
    if (victimUuid !== null) {
        victim = session.players.get(victimUuid)
        if (!victim) throw new Error(`commitNightResolution: victim(${victimUuid})이 참가자가 아님`)
        if (victim.alive !== true) throw new Error(`commitNightResolution: victim(${victimUuid})이 이미 사망 상태`)
    }
    restoreNightPreparation(resolution, record.prepared)
    resolution.pendingEliminationTargetId = victimUuid
    record.consumed = true
    resolution.publicDeathReveals = buildNightDeathReveals(resolution, victimUuid === null ? [] : [victimUuid])
    session.nightResolution = resolution
    if (victim) {
        victim.alive = false
        victim.deathReason = DEATH_REASONS.ASSASSINATION
        observeNightCommit('NIGHT_DEATH_FINALIZED', { gameId: session.id, victimUuid, reason: DEATH_REASONS.ASSASSINATION })
    }
    expireDeadPlayerNightEffects(session, victimUuid === null ? [] : [victimUuid])

    const winResult = evaluateWinCondition(session)
    observeNightCommit('WIN_EVALUATED', { gameId: session.id, source: 'NIGHT', winner: winResult?.winner ?? null })
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, victimUuid, terminal: { winner: winResult.winner } }
    }

    enterDayPhase(session)
    return { ok: true, victimUuid, terminal: null }
}

module.exports = {
    resolveNightDeathSource,
    buildNightDeathReveals,
    expireDeadPlayerNightEffects,
    commitNightResolution,
}
