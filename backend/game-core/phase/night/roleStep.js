// 밤 역할 차례 파일
// 역할 하나 차례 판정 + 진행 기록에 반영 (지도 05·06)
const { getAliveActorUuidsForRole, matchesTargetLifeRule, isRoleTurnComplete } = require('./actors')
const { NIGHT_ACTION_RESOLUTION_POLICY, NIGHT_RECOVERY_STATES, NIGHT_TURN_ORDER, EMPTY_COMPLETED_ROLES } = require('./constants')
const { isRecoveryBlockedState, getNightProgress, ensureNightProgress } = require('./progress')
const { isRegisteredSession } = require('../../queries')
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
    // 다 건너뛰었으면 대상 없음
    if (targets.length === 0) return null

    // 만장일치 역할: 고른 대상이 전부 같을 때만
    if (NIGHT_ACTION_RESOLUTION_POLICY[role] !== 'PLURALITY') {
        return targets.every((target) => target === targets[0]) ? targets[0] : null
    }

    // 광대: 대상별로 표 세기
    const voteCounts = new Map()
    for (const target of targets) voteCounts.set(target, (voteCounts.get(target) ?? 0) + 1)

    // 제일 많은 표 찾기, 같은 표 수가 또 나오면 동률 표시
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
        // 건너뛴 사람은 볼 것 없음
        if (target === null || target === undefined) continue
        // 대상이 판에서 사라졌거나, 낸 뒤로 생사가 바뀌었으면 이 사람 돌려줌
        const targetPlayer = session.players.get(target)
        if (!targetPlayer) return actorUuid
        if (!matchesTargetLifeRule(role, targetPlayer)) return actorUuid
    }
    return null
}

// 역할 차례 결과 계산 (역할 없음·행동할 사람 없음·막힘·결과 없음·결정)
function computeNightRoleStep(session, progress, role) {
    // 판에 이 역할이 아예 없음
    const hasRoleInGame = [...session.players.values()].some((player) => player.role === role)
    if (!hasRoleInGame) return { role, targetId: null, status: 'NO_ROLE' }

    // 있긴 한데 오늘 밤 행동할 산 사람이 없음
    const actors = getAliveActorUuidsForRole(session, role)
    if (actors.length === 0) {
        return { role, targetId: null, status: 'NO_ACTOR' }
    }

    // 광대한테 찍혀 치료 기다리는 사람은 행동 못 함 (의사는 예외)
    const excludedActorUuids = role === 'DOCTOR'
        ? new Set()
        : new Set(actors.filter((actorUuid) => isRecoveryBlockedState(progress.recoveryStates.get(actorUuid))))

    // 대상 하나로 못 정했으면, 막힌 사람 때문인지 그냥 없는지 나눔
    const targetId = resolveRoleNightAction(session, role, excludedActorUuids)
    if (targetId === null) {
        return { role, targetId: null, status: excludedActorUuids.size > 0 ? 'RECOVERY_BLOCKED' : 'NO_RESULT' }
    }
    return { role, targetId, status: 'RESOLVED' }
}

// 치료 시간 끝: 치료 못 받은 사람은 죽을 예정으로
function closeNightHealing(progress) {
    // 이미 마감했으면 그대로
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
    // 차례 결과·역할별 대상 적기
    progress.roleSteps.push(step)
    progress.roleTargets.set(step.role, step.targetId)

    // 대상이 정해진 차례만 회복 상태를 건드림
    if (step.status === 'RESOLVED') {
        // 광대가 찍은 사람 = 치료 기다림
        if (step.role === 'JOKER') {
            progress.recoveryStates.set(step.targetId, NIGHT_RECOVERY_STATES.PENDING_RECOVERY)
            progress.events.push({ type: 'KILL', targetId: step.targetId })
        // 의사가 치료 기다리는 사람을 골랐으면 회복
        } else if (step.role === 'DOCTOR') {
            if (progress.recoveryStates.get(step.targetId) === NIGHT_RECOVERY_STATES.PENDING_RECOVERY) {
                progress.recoveryStates.set(step.targetId, NIGHT_RECOVERY_STATES.RECOVERED)
                progress.events.push({ type: 'HEAL', targetId: step.targetId })
            }
        }
    }

    // 의사 차례가 끝나면 치료 시간도 끝 (대상 없어도)
    if (step.role === 'DOCTOR') closeNightHealing(progress)

    // 이 역할 끝 표시, 기록 번호 올림 (판정 commit이 비교)
    progress.completedRoles.add(step.role)
    progress.revision += 1
}

// 역할 차례 끝내기: 순서·다 냈는지·대상 맞는지 보고 기록에 반영
function completeNightRole(session, role) {
    // 진짜 판 장부에 있는 그 판인지
    if (!isRegisteredSession(session)) return { ok: false, code: 'SESSION_NOT_FOUND' }

    // 끝난 판이면 거절
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    // 판정 전 밤일 때만, 밤 차례에 있는 역할만
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (!NIGHT_TURN_ORDER.includes(role)) return { ok: false, code: 'INVALID_ROLE' }

    // 이미 끝낸 역할이면 거절, 앞 역할이 다 끝나야 이 역할 차례
    const completedRoles = getNightProgress(session)?.completedRoles ?? EMPTY_COMPLETED_ROLES
    if (completedRoles.has(role)) return { ok: false, code: 'ROLE_ALREADY_COMPLETED' }
    for (const earlierRole of NIGHT_TURN_ORDER) {
        if (earlierRole === role) break
        if (!completedRoles.has(earlierRole)) return { ok: false, code: 'ROLE_OUT_OF_ORDER' }
    }
    // 이 역할 산 사람 전부 냈는지
    if (!isRoleTurnComplete(session, role)) return { ok: false, code: 'ACTIONS_PENDING' }

    // 낸 뒤로 대상이 사라졌거나 생사가 바뀌었으면 거절
    if (findInvalidRoleSubmission(session, role) !== null) {
        return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
    }

    // 여기부터 진짜 바뀜: 차례 진행 기록에 이 역할 결과 반영
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
