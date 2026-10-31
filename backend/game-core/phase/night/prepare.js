// 밤 판정 준비 파일
// 밤 결과 계산 + 개인 결과 만들기, 아직 확정 안 함
const { playerSession, gameSessions } = require('../../core/state')
const { assertSessionNotEnded } = require('../../core/terminal')
const { getNightProgress, createNightProgress } = require('./progress')
const { NIGHT_TURN_ORDER } = require('./constants')
const { getEligibleNightActorUuids, requiresAliveTarget } = require('./actors')
const { applyNightRoleStep, computeNightRoleStep, closeNightHealing } = require('./roleStep')
const { isParticipatingInSession } = require('../../queries')
const { buildAssassinationFailureNotice } = require('./payloads')
const { registerNightPreparation } = require('./preparation')

// 요청한 사람 확인하고 밤 판정 준비
function prepareNightResolution(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    return prepareNightResolutionForSession(session)
}

// 밤 판정 준비: 역할 차례 결과로 죽을 사람·개인 결과 정하고 대장에 등록
// 차례 진행했으면 그 기록 쓰고, 아니면 여기서 한 번에 계산
function prepareNightResolutionForSession(session) {
    if (!session || typeof session.id !== 'string') return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }

    const endedCheck1 = assertSessionNotEnded(session)
    if (!endedCheck1.ok) return endedCheck1

    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }

    const sequencedProgress = getNightProgress(session)?.sequenced === true ? getNightProgress(session) : null

    let progress
    if (sequencedProgress) {
        for (const role of NIGHT_TURN_ORDER) {
            if (!sequencedProgress.completedRoles.has(role)) return { ok: false, code: 'ACTIONS_PENDING' }
        }
        if (!sequencedProgress.healingClosed) return { ok: false, code: 'ACTIONS_PENDING' }
        progress = sequencedProgress
    } else {
        const eligibleActorUuids = getEligibleNightActorUuids(session)
        for (const actorUuid of eligibleActorUuids) {
            if (!session.nightActions.has(actorUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
        }

        for (const actorUuid of eligibleActorUuids) {
            const target = session.nightActions.get(actorUuid)
            if (target !== null) {
                const targetPlayer = session.players.get(target)
                if (!targetPlayer) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
                const actorRole = session.players.get(actorUuid)?.role
                const targetStateOk = requiresAliveTarget(actorRole) ? targetPlayer.alive === true : targetPlayer.alive !== true
                if (!targetStateOk) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
            }
        }

        progress = createNightProgress(session, { sequenced: false })
        for (const role of NIGHT_TURN_ORDER) {
            applyNightRoleStep(progress, computeNightRoleStep(session, progress, role))
        }
        closeNightHealing(progress)
    }

    const assassinationTargetId = progress.roleTargets.get('JOKER') ?? null
    const protectionTargetId = progress.roleTargets.get('DOCTOR') ?? null
    const investigationTargetId = progress.roleTargets.get('GUARD') ?? null
    const confirmationTargetId = progress.roleTargets.get('WITCH_HUNTER') ?? null

    const protectedTargetIds = new Set(protectionTargetId === null ? [] : [protectionTargetId])
    const assassinationBlocked =
        assassinationTargetId !== null && protectedTargetIds.has(assassinationTargetId)

    let pendingEliminationTargetId = assassinationBlocked ? null : assassinationTargetId
    if (pendingEliminationTargetId !== null) {
        const candidate = session.players.get(pendingEliminationTargetId)
        if (!candidate || candidate.alive !== true || !isParticipatingInSession(session, pendingEliminationTargetId)) {
            pendingEliminationTargetId = null
        }
    }

    const privateResultBuilderByRole = new Map()
    if (investigationTargetId !== null && session.players.has(investigationTargetId)) {
        const role = session.players.get(investigationTargetId).role
        privateResultBuilderByRole.set('GUARD', () => ({
            actionType: 'INVESTIGATE',
            targetId: investigationTargetId,
            role,
        }))
    }
    if (confirmationTargetId !== null && session.players.has(confirmationTargetId)) {
        const role = session.players.get(confirmationTargetId).role
        privateResultBuilderByRole.set('WITCH_HUNTER', () => ({
            actionType: 'CONFIRM',
            targetId: confirmationTargetId,
            role,
        }))
    }
    if (assassinationBlocked) {
        privateResultBuilderByRole.set('JOKER', buildAssassinationFailureNotice)
    }

    const privateResults = new Map()
    for (const player of session.players.values()) {
        if (player.alive !== true) continue
        const buildResult = privateResultBuilderByRole.get(player.role)
        if (buildResult !== undefined) privateResults.set(player.uuid, buildResult())
    }

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
