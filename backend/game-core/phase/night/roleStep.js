// 밤 역할 차례 파일
// 역할 하나 차례 판정 + 진행 기록에 반영 (지도 05·06)
const { getAliveActorUuidsForRole, requiresAliveTarget, isRoleTurnComplete } = require('./actors')
const { NIGHT_ACTION_RESOLUTION_POLICY, NIGHT_RECOVERY_STATES, NIGHT_TURN_ORDER, EMPTY_COMPLETED_ROLES } = require('./constants')
const { isRecoveryBlockedState, getNightProgress, ensureNightProgress } = require('./progress')
const { gameSessions } = require('../../core/state')
const { assertSessionNotEnded } = require('../../core/terminal')

// 이 역할 사람들이 낸 대상 모으기 (빼라는 사람 빼고)
function collectRoleNightSubmissions(session, role, excludedActorUuids = new Set()) {
    return getAliveActorUuidsForRole(session, role)
        .filter((actorUuid) => !excludedActorUuids.has(actorUuid))
        .map((actorUuid) => ({
            actorUuid,
            target: session.nightActions.get(actorUuid) ?? null,
        }))
}

// 역할 대상 하나로 정하기: 광대는 최다표(동률이면 없음), 나머지는 전원 같아야 함
function resolveRoleNightAction(session, role, excludedActorUuids = new Set()) {
    const targets = collectRoleNightSubmissions(session, role, excludedActorUuids)
        .map((submission) => submission.target)
        .filter((target) => target !== null)
    if (targets.length === 0) return null

    if (NIGHT_ACTION_RESOLUTION_POLICY[role] !== 'PLURALITY') {
        return targets.every((target) => target === targets[0]) ? targets[0] : null
    }

    const voteCounts = new Map()
    for (const target of targets) voteCounts.set(target, (voteCounts.get(target) ?? 0) + 1)

    let winner = null
    let winnerVotes = 0
    let tie = false
    for (const [target, votes] of voteCounts) {
        if (votes > winnerVotes) {
            winner = target
            winnerVotes = votes
            tie = false
        } else if (votes === winnerVotes) {
            tie = true
        }
    }
    return tie ? null : winner
}

// 대상이 판에 없거나 살아/죽어 있어야 하는데 아닌 사람 찾기
function findInvalidRoleSubmission(session, role) {
    for (const actorUuid of getAliveActorUuidsForRole(session, role)) {
        const target = session.nightActions.get(actorUuid)
        if (target === null || target === undefined) continue
        const targetPlayer = session.players.get(target)
        if (!targetPlayer) return actorUuid
        const targetStateOk = requiresAliveTarget(role) ? targetPlayer.alive === true : targetPlayer.alive !== true
        if (!targetStateOk) return actorUuid
    }
    return null
}

// 역할 차례 결과 계산 (역할 없음·행동할 사람 없음·막힘·결과 없음·결정)
function computeNightRoleStep(session, progress, role) {
    const hasRoleInGame = [...session.players.values()].some((player) => player.role === role)
    if (!hasRoleInGame) return { role, targetId: null, status: 'NO_ROLE' }

    const actors = getAliveActorUuidsForRole(session, role)
    if (actors.length === 0) {
        return { role, targetId: null, status: 'NO_ACTOR' }
    }

    const excludedActorUuids = role === 'DOCTOR'
        ? new Set()
        : new Set(actors.filter((actorUuid) => isRecoveryBlockedState(progress.recoveryStates.get(actorUuid))))

    const targetId = resolveRoleNightAction(session, role, excludedActorUuids)
    if (targetId === null) {
        return { role, targetId: null, status: excludedActorUuids.size > 0 ? 'RECOVERY_BLOCKED' : 'NO_RESULT' }
    }
    return { role, targetId, status: 'RESOLVED' }
}

// 치료 시간 끝: 치료 못 받은 사람은 죽을 예정으로
function closeNightHealing(progress) {
    if (progress.healingClosed) return
    progress.healingClosed = true
    for (const [uuid, state] of progress.recoveryStates) {
        if (state === NIGHT_RECOVERY_STATES.PENDING_RECOVERY) {
            progress.recoveryStates.set(uuid, NIGHT_RECOVERY_STATES.DEATH_CANDIDATE)
        }
    }
}

// 차례 결과를 진행 기록에 반영 (광대 지목 → 치료 대기, 의사 치료 → 회복)
function applyNightRoleStep(progress, step) {
    progress.roleSteps.push(step)
    progress.roleTargets.set(step.role, step.targetId)

    if (step.status === 'RESOLVED') {
        if (step.role === 'JOKER') {
            progress.recoveryStates.set(step.targetId, NIGHT_RECOVERY_STATES.PENDING_RECOVERY)
            progress.events.push({ type: 'KILL', targetId: step.targetId })
        } else if (step.role === 'DOCTOR') {
            if (progress.recoveryStates.get(step.targetId) === NIGHT_RECOVERY_STATES.PENDING_RECOVERY) {
                progress.recoveryStates.set(step.targetId, NIGHT_RECOVERY_STATES.RECOVERED)
                progress.events.push({ type: 'HEAL', targetId: step.targetId })
            }
        }
    }

    if (step.role === 'DOCTOR') closeNightHealing(progress)

    progress.completedRoles.add(step.role)
    progress.revision += 1
}

// 역할 차례 끝내기: 순서·다 냈는지·대상 맞는지 보고 기록에 반영
function completeNightRole(session, role) {
    if (!session || typeof session.id !== 'string') return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (!NIGHT_TURN_ORDER.includes(role)) return { ok: false, code: 'INVALID_ROLE' }

    const completedRoles = getNightProgress(session)?.completedRoles ?? EMPTY_COMPLETED_ROLES
    if (completedRoles.has(role)) return { ok: false, code: 'ROLE_ALREADY_COMPLETED' }
    for (const earlierRole of NIGHT_TURN_ORDER) {
        if (earlierRole === role) break
        if (!completedRoles.has(earlierRole)) return { ok: false, code: 'ROLE_OUT_OF_ORDER' }
    }
    if (!isRoleTurnComplete(session, role)) return { ok: false, code: 'ACTIONS_PENDING' }

    if (findInvalidRoleSubmission(session, role) !== null) {
        return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
    }

    const progress = ensureNightProgress(session, { sequenced: true })
    const step = computeNightRoleStep(session, progress, role)
    applyNightRoleStep(progress, step)

    return {
        ok: true,
        role,
        alreadyCompleted: false,
        step: { ...step },
        revision: progress.revision,
        healingClosed: progress.healingClosed,
    }
}

module.exports = {
    collectRoleNightSubmissions,
    resolveRoleNightAction,
    findInvalidRoleSubmission,
    computeNightRoleStep,
    closeNightHealing,
    applyNightRoleStep,
    completeNightRole,
}
