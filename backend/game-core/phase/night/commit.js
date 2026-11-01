// 밤 확정 파일
// 밤 판정 확정 + 죽은 사람 밤 행동 지움, 확정 뒤 승패 판정·낮으로
// 사망 공개 목록 만들기는 payloads.js (방송 내용이라 확정 파일에서 뺌)
const { NIGHT_TURN_ORDER } = require('./constants')
const { buildNightDeathReveals } = require('./payloads')
const { isObserverBusy, observeNightCommit } = require('../../core/observer')
const { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession } = require('../../core/terminal')
const { nightPreparations, computeNightInputFingerprint, restoreNightPreparation } = require('./preparation')
const { getNightProgress } = require('./progress')
const { isParticipatingInSession, isRegisteredSession, getParticipationRevision } = require('../../queries')
const { DEATH_REASONS } = require('../../result')
const { enterDayPhase } = require('../day')

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
    // 시험 관찰자가 도는 중에 또 들어온 확정 막기
    if (isObserverBusy()) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
    // 그사이 판이 끝났으면 거절
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck 

    // prepare가 대장에 넣은 결과인지 (밖에서 만든 결과 거절)
    const record = (resolution !== null && typeof resolution === 'object')
        ? nightPreparations.get(resolution)
        : undefined
    if (!record) return { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' }
    if (record.session !== session) return { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' }
    // 같은 준비로 두 번 확정 못 함
    if (record.consumed) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    // 진짜 판 장부에 있는 그 판인지, 아직 같은 날 밤인지
    if (!isRegisteredSession(session)) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (record.gameId !== session.id) return { ok: false, code: 'STALE_RESOLUTION' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (record.nightDayIndex !== session.dayIndex) return { ok: false, code: 'STALE_RESOLUTION' }
    // 다른 길로 이미 판정된 밤이면 거절
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    // 준비 뒤에 누가 판에서 빠졌으면 다시 준비해야 함
    const currentParticipationRevision = getParticipationRevision(session)
    if (currentParticipationRevision !== record.participationRevision) return { ok: false, code: 'STALE_RESOLUTION' }

    // 준비 뒤에 제출·진행이 바뀌었는지 지문으로 확인 (지도 06-⑥)
    if (record.inputFingerprint !== computeNightInputFingerprint(session)) {
        return { ok: false, code: 'STALE_RESOLUTION' }
    }

    // 차례 진행 밤이면: 기록 번호 같고, 치료 마감·네 역할 다 끝났는지
    if (record.sequenced) {
        const progress = getNightProgress(session)
        if (!progress || progress.sequenced !== true) return { ok: false, code: 'STALE_RESOLUTION' }
        if (progress.revision !== record.progressRevision) return { ok: false, code: 'STALE_RESOLUTION' }
        if (!progress.healingClosed) return { ok: false, code: 'ACTIONS_PENDING' }
        for (const role of NIGHT_TURN_ORDER) {
            if (!progress.completedRoles.has(role)) return { ok: false, code: 'ACTIONS_PENDING' }
        }
    }

    // 희생자가 그사이 판에서 빠졌으면 희생자 없음 (지도 06-⑦)
    let victimUuid = record.pendingEliminationTargetId ?? null
    if (victimUuid !== null && session.players.has(victimUuid) && !isParticipatingInSession(session, victimUuid)) {
        victimUuid = null
    }

    // 희생자가 판에 없거나 이미 죽었으면 계산이 꼬인 것, 바꾸기 전에 멈춤
    let victim = null
    if (victimUuid !== null) {
        victim = session.players.get(victimUuid)
        if (!victim) throw new Error(`commitNightResolution: victim(${victimUuid})이 참가자가 아님`)
        if (victim.alive !== true) throw new Error(`commitNightResolution: victim(${victimUuid})이 이미 사망 상태`)
    }
    // 여기부터 진짜 바뀜: 결과를 준비 때 값으로 되돌리고 다 쓴 표시, 판정 기록
    restoreNightPreparation(resolution, record.prepared)
    resolution.pendingEliminationTargetId = victimUuid
    record.consumed = true
    resolution.publicDeathReveals = buildNightDeathReveals(resolution, victimUuid === null ? [] : [victimUuid])
    session.nightResolution = resolution
    // 희생자 있으면 암살로 사망
    if (victim) {
        victim.alive = false
        victim.deathReason = DEATH_REASONS.ASSASSINATION
        observeNightCommit('NIGHT_DEATH_FINALIZED', { gameId: session.id, victimUuid, reason: DEATH_REASONS.ASSASSINATION })
    }
    // 죽은 사람이 낸 밤 행동은 지움
    expireDeadPlayerNightEffects(session, victimUuid === null ? [] : [victimUuid])

    // 승패 나면 판 닫기
    const winResult = evaluateWinCondition(session)
    observeNightCommit('WIN_EVALUATED', { gameId: session.id, source: 'NIGHT', winner: winResult?.winner ?? null })
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, victimUuid, terminal: { winner: winResult.winner } }
    }

    // 승패 안 나면 다음 날 낮으로
    enterDayPhase(session)
    return { ok: true, victimUuid, terminal: null }
}

module.exports = {
    expireDeadPlayerNightEffects,
    commitNightResolution,
}
