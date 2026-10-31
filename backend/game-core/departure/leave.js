// 게임 중 나가기 파일
// 나간 사람 정리 + 나간 뒤 멈춘 단계 넘기기 (지도 12)
const { assertSessionNotEnded } = require('../core/terminal')
const { commitDisconnectElimination } = require('./eliminate')
const { playerSession } = require('../core/state')
const { TRIBUNAL_PENDING, tallyTribunalBallots, buildTribunalBallotSnapshot, TRIBUNAL_CANCELLED_OUTCOME, TRIBUNAL_CANCEL_REASONS } = require('../phase/tribunal')
const { isRoleRevealComplete } = require('../setup')
const { enterDayPhase, getDayPhase, DAY_PHASES, getEligibleDayVoterUuids, enterDayVotePhase } = require('../phase/day')

// 게임 중 나가기: 산 사람이면 탈락, 방장 넘기기, 남은 표·준비·밤 행동에서 빼기
// 피고가 나가면 재판 취소하고 밤으로
function commitParticipantDeparture(session, uuid, { reason = 'PARTICIPANT_LEFT' } = {}) {
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const player = session.players.get(uuid)
    if (!player) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (player.isParticipating === false) return { ok: false, code: 'ALREADY_LEFT' }
    if (session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)) {
        return { ok: false, code: 'ALREADY_LEFT' }
    }

    const wasAlive = player.alive === true
    const phaseAtDeparture = session.phase
    const wasDefendant = session.phase === 'TRIBUNAL'
        && session.tribunal?.defendantUuid === uuid
        && session.tribunal?.resolved !== true

    let eliminated = false
    let terminal = null
    if (wasAlive) {
        const applied = commitDisconnectElimination(session, uuid)
        if (!applied.ok) return applied
        eliminated = true
        terminal = applied.terminal
    } else {
        if (!session.forfeitedUuids) session.forfeitedUuids = new Set()
        session.forfeitedUuids.add(uuid)
        if (!session.detachedUuids) session.detachedUuids = new Set()
        session.detachedUuids.add(uuid)
    }

    player.isParticipating = false
    session.participationRevision =
        (Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0) + 1

    const released = playerSession.get(uuid) === session.id
    if (released) playerSession.delete(uuid)

    let hostChanged = false
    let newHostUuid = session.hostUuid ?? null
    if (session.hostUuid === uuid) {
        newHostUuid = null
        for (const candidate of session.players.values()) {
            if (candidate.uuid === uuid) continue
            if (candidate.isParticipating === false) continue
            newHostUuid = candidate.uuid
            break
        }
        session.hostUuid = newHostUuid
        hostChanged = true
    }

    const cleanup = {
        removedRoleRevealAck: false,
        removedDayVoteReady: false,
        removedDayVote: false,
        normalizedVoterUuids: [],
        removedTribunalVote: false,
    }
    let tribunalCancelled = false

    if (!terminal) {
        if (session.roleRevealAcks instanceof Set) {
            cleanup.removedRoleRevealAck = session.roleRevealAcks.delete(uuid)
        }
        if (session.dayVoteReadyUuids instanceof Set) {
            cleanup.removedDayVoteReady = session.dayVoteReadyUuids.delete(uuid)
        }
        if (session.dayVotes instanceof Map) {
            cleanup.removedDayVote = session.dayVotes.delete(uuid)
            for (const [voterUuid, targetUuid] of session.dayVotes) {
                if (targetUuid !== uuid) continue
                session.dayVotes.set(voterUuid, null)
                cleanup.normalizedVoterUuids.push(voterUuid)
            }
        }
        if (session.nightActions instanceof Map) {
            session.nightActions.delete(uuid)
            for (const [actorUuid, targetId] of session.nightActions) {
                if (targetId === uuid) session.nightActions.set(actorUuid, null)
            }
        }

        if (session.tribunal && session.tribunal.resolved !== true) {
            if (session.tribunal.votes instanceof Map) {
                cleanup.removedTribunalVote = session.tribunal.votes.delete(uuid)
            }
            if (wasDefendant) {
                TRIBUNAL_PENDING.delete(session)
                const counts = tallyTribunalBallots(
                    buildTribunalBallotSnapshot(session, session.tribunal),
                    session.tribunal.defendantUuid,
                ).counts
                session.tribunal.outcome = TRIBUNAL_CANCELLED_OUTCOME
                session.tribunal.cancelReason = TRIBUNAL_CANCEL_REASONS.DEFENDANT_LEFT
                session.tribunal.counts = { guilty: counts.guilty, notGuilty: counts.notGuilty }
                session.tribunal.executedUuid = null
                session.tribunal.resolved = true
                session.phase = 'NIGHT'
                session.nightActions = new Map()
                session.nightResolution = null
                session.nightProgress = null
                tribunalCancelled = true
            }
        }
    }

    return {
        ok: true,
        reason,
        victimUuid: uuid,
        eliminated,
        terminal,
        wasAlive,
        phaseAtDeparture,
        hostChanged,
        newHostUuid,
        participationRevision: session.participationRevision,
        released,
        tribunalCancelled,
        cleanup,
    }
}

// 나간 사람 때문에 다 찬 단계면 넘김 (역할 확인 → 낮, 토론 → 투표)
function advanceStalledPhaseAfterDeparture(session) {
    if (session.phase === 'ROLE_REVEAL') {
        if (!isRoleRevealComplete(session)) return { transitioned: null }
        enterDayPhase(session)
        return { transitioned: 'DAY' }
    }
    if (session.phase === 'DAY' && getDayPhase(session) === DAY_PHASES.DISCUSSION) {
        const eligibleUuids = getEligibleDayVoterUuids(session)
        if (eligibleUuids.length === 0) return { transitioned: null }
        const readyUuids = session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
        if (!eligibleUuids.every((uuid) => readyUuids.has(uuid))) return { transitioned: null }
        enterDayVotePhase(session)
        return { transitioned: 'DAY_VOTE' }
    }
    return { transitioned: null }
}

module.exports = {
    commitParticipantDeparture,
    advanceStalledPhaseAfterDeparture,
}
