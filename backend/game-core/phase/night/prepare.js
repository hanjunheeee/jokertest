// 밤 판정 준비 파일
// 밤 결과 계산 + 개인 결과 만들기, 아직 확정 안 함
const { findActorSession } = require('../../core/registry/lookup')
const { assertSessionNotEnded } = require('../../core/rules/terminal')
const { getNightProgress, createNightProgress } = require('./progress')
const { NIGHT_TURN_ORDER } = require('./constants')
const { getEligibleNightActorUuids, matchesTargetLifeRule } = require('./actors')
const { applyNightRoleStep, computeNightRoleStep, closeNightHealing } = require('./roleStep')
const { isParticipatingInSession, isRegisteredSession } = require('../../queries')
const { buildAssassinationFailureNotice } = require('./payloads')
const { registerNightPreparation } = require('./ledger')

// 요청한 사람 확인하고 밤 판정 준비
function prepareNightResolution(uuid, gameId) {
    // 판 id 확인 + 내 판 찾기, 내가 판에 있는지 (옛 판 화면에서 누른 것 거절) (지도 06-③)
    const found = findActorSession(uuid, gameId, { requireActor: false })
    if (!found.ok) return found

    // 나머지는 자동 마무리랑 같은 길로
    return prepareNightResolutionForSession(found.session)
}

// 밤 판정 준비: 역할 차례 결과로 죽을 사람·개인 결과 정하고 대장에 등록
// 차례 진행했으면 그 기록 쓰고, 아니면 여기서 한 번에 계산
function prepareNightResolutionForSession(session) {
    // 진짜 판 장부에 있는 그 판인지
    if (!isRegisteredSession(session)) return { ok: false, code: 'SESSION_NOT_FOUND' }

    // 끝난 판이면 거절
    const endedCheck1 = assertSessionNotEnded(session)
    if (!endedCheck1.ok) return endedCheck1

    // 아직 판정 안 된 밤일 때만
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }

    // 오늘 밤 차례대로 진행했는지 (했으면 그 기록 사용)
    const sequencedProgress = getNightProgress(session)?.sequenced === true ? getNightProgress(session) : null

    let progress
    if (sequencedProgress) {
        // 차례 진행: 네 역할 다 끝나고 치료도 마감됐을 때만
        for (const role of NIGHT_TURN_ORDER) {
            if (!sequencedProgress.completedRoles.has(role)) return { ok: false, code: 'ACTIONS_PENDING' }
        }
        if (!sequencedProgress.healingClosed) return { ok: false, code: 'ACTIONS_PENDING' }
        progress = sequencedProgress
    } else {
        // 한 번에 계산: 행동할 사람 전부 냈는지
        const eligibleActorUuids = getEligibleNightActorUuids(session)
        for (const actorUuid of eligibleActorUuids) {
            if (!session.nightActions.has(actorUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
        }

        // 고른 대상이 아직 판에 있고 생사 조건 맞는지 (그사이 바뀌었을 수 있음)
        for (const actorUuid of eligibleActorUuids) {
            const target = session.nightActions.get(actorUuid)
            if (target !== null) {
                const targetPlayer = session.players.get(target)
                if (!targetPlayer) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
                const actorRole = session.players.get(actorUuid)?.role
                if (!matchesTargetLifeRule(actorRole, targetPlayer)) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
            }
        }

        // 판에 안 붙인 임시 기록에 네 역할 차례를 한 번에 돌림 (판은 안 바뀜)
        progress = createNightProgress(session, { sequenced: false })
        for (const role of NIGHT_TURN_ORDER) {
            applyNightRoleStep(progress, computeNightRoleStep(session, progress, role))
        }
        closeNightHealing(progress)
    }

    // 역할별로 정해진 대상 꺼내기
    const assassinationTargetId = progress.roleTargets.get('JOKER') ?? null
    const protectionTargetId = progress.roleTargets.get('DOCTOR') ?? null
    const investigationTargetId = progress.roleTargets.get('GUARD') ?? null
    const confirmationTargetId = progress.roleTargets.get('WITCH_HUNTER') ?? null

    // 의사가 지킨 사람을 광대가 노렸으면 암살 막힘
    const protectedTargetIds = new Set(protectionTargetId === null ? [] : [protectionTargetId])
    const assassinationBlocked =
        assassinationTargetId !== null && protectedTargetIds.has(assassinationTargetId)

    // 죽을 사람이 이미 죽었거나 판에서 빠졌으면 희생자 없음 (지도 06-⑦)
    let pendingEliminationTargetId = assassinationBlocked ? null : assassinationTargetId
    if (pendingEliminationTargetId !== null) {
        const candidate = session.players.get(pendingEliminationTargetId)
        if (!candidate || candidate.alive !== true || !isParticipatingInSession(session, pendingEliminationTargetId)) {
            pendingEliminationTargetId = null
        }
    }

    // 개인 결과 만드는 법을 역할별로: 경비원 조사·마녀사냥꾼 확인·광대 실패
    const privateBuilders = new Map()
    if (investigationTargetId !== null && session.players.has(investigationTargetId)) {
        const role = session.players.get(investigationTargetId).role
        privateBuilders.set('GUARD', () => ({
            actionType: 'INVESTIGATE',
            targetId: investigationTargetId,
            role,
        }))
    }
    if (confirmationTargetId !== null && session.players.has(confirmationTargetId)) {
        const role = session.players.get(confirmationTargetId).role
        privateBuilders.set('WITCH_HUNTER', () => ({
            actionType: 'CONFIRM',
            targetId: confirmationTargetId,
            role,
        }))
    }
    if (assassinationBlocked) {
        privateBuilders.set('JOKER', buildAssassinationFailureNotice)
    }

    // 그 역할 산 사람마다 개인 결과 하나씩 (받는 사람 uuid로 꺼냄)
    const privateResults = new Map()
    for (const player of session.players.values()) {
        if (player.alive !== true) continue
        const buildResult = privateBuilders.get(player.role)
        if (buildResult !== undefined) privateResults.set(player.uuid, buildResult())
    }

    // 판정 결과 묶음 (진행 기록은 복사해서 담음)
    const resolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        assassinationTargetId,
        protectedTargetIds,
        pendingEliminationTargetId,
        privateResults,
        roleSteps: progress.roleSteps.map((step) => ({ ...step })),
        events: progress.events.map((event) => ({ ...event })),
        recoveryStates: new Map(progress.recoveryStates),
        resolved: true,
    }

    // 대장에 등록, commit이 이거랑 비교 (아직 확정 안 함)
    registerNightPreparation(session, resolution, {
        sequenced: progress.sequenced === true,
        progressRevision: progress.revision,
    })

    return { ok: true, session, resolution }
}

module.exports = {
    prepareNightResolution,
    prepareNightResolutionForSession,
}
