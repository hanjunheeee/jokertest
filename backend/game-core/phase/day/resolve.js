// 낮 판정 파일
// 낮 투표 판정 prepare/commit + 결과 방송 내용 (지도 04)
const { playerSession, gameSessions } = require('../../core/state')
const { assertSessionNotEnded } = require('../../core/terminal')
const { getDayVoteRound, getResolutionRound, getDayPhase, getDayVoteExcludedUuids } = require('./state')
const { DAY_PHASES } = require('./constants')
const { getEligibleDayVoterUuids, tallyDayVoteOutcome, buildDayVoteBallotSnapshot, uuidListsEqual, dayVoteBallotSnapshotsEqual } = require('./ballots')

// 낮 판정 준비: 표 세서 결과 정함, 아직 확정 안 함
function prepareDayVoteResolution(uuid, gameId, dayIndex) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }

    const currentRound = getDayVoteRound(session)
    if (
        session.dayVoteResolution !== null &&
        session.dayVoteResolution.dayIndex === dayIndex &&
        getResolutionRound(session.dayVoteResolution) === currentRound
    ) {
        return { ok: true, alreadyResolved: true, session, resolution: session.dayVoteResolution }
    }

    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }

    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    for (const voterUuid of eligibleVoterUuids) {
        if (!session.dayVotes.has(voterUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
    }

    for (const voterUuid of eligibleVoterUuids) {
        const target = session.dayVotes.get(voterUuid)
        if (target !== null) {
            const targetPlayer = session.players.get(target)
            if (!targetPlayer || !targetPlayer.alive) {
                return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
            }
        }
    }

    const tally = tallyDayVoteOutcome(session)
    const isRevote = tally.outcome === 'TIE' && currentRound === 1
    return {
        ok: true,
        session,
        resolution: {
            gameId: session.id,
            dayIndex: session.dayIndex,
            round: currentRound,
            outcome: isRevote ? 'REVOTE' : tally.outcome,
            tribunalTargetUuid: tally.tribunalTargetUuid,
            publicVoteCount: tally.publicVoteCount,
            publicAbstainCount: tally.publicAbstainCount,
            excludedUuids: Object.freeze([...getDayVoteExcludedUuids(session)].sort()),
            revoteExcludedUuids: Object.freeze(isRevote ? [...tally.tiedTargetUuids] : []),
            ballotSnapshot: buildDayVoteBallotSnapshot(session),
        },
    }
}

// 낮 판정 확정: 그사이 표 안 바뀌었으면 재판·재투표·밤 중 하나로
function commitDayVoteResolution(session, resolution) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (resolution.dayIndex !== session.dayIndex || getResolutionRound(resolution) !== getDayVoteRound(session)) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    if (session.phase !== 'DAY') return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }

    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    for (const voterUuid of eligibleVoterUuids) {
        if (!session.dayVotes.has(voterUuid)) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
        const target = session.dayVotes.get(voterUuid)
        if (target === null) continue
        const targetPlayer = session.players.get(target)
        if (!targetPlayer || !targetPlayer.alive) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    const recheck = tallyDayVoteOutcome(session)
    const recheckOutcome = recheck.outcome === 'TIE' && getDayVoteRound(session) === 1 ? 'REVOTE' : recheck.outcome
    if (
        recheckOutcome !== resolution.outcome ||
        recheck.tribunalTargetUuid !== resolution.tribunalTargetUuid ||
        recheck.publicVoteCount !== resolution.publicVoteCount ||
        recheck.publicAbstainCount !== resolution.publicAbstainCount
    ) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    const recheckRevoteExcluded = recheckOutcome === 'REVOTE' ? [...recheck.tiedTargetUuids].sort() : []
    if (!uuidListsEqual(recheckRevoteExcluded, resolution.revoteExcludedUuids ?? [])) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    if (!uuidListsEqual([...getDayVoteExcludedUuids(session)].sort(), resolution.excludedUuids ?? [])) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    if (!dayVoteBallotSnapshotsEqual(buildDayVoteBallotSnapshot(session), resolution.ballotSnapshot)) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    if (resolution.outcome === 'TRIBUNAL') {
        const defendant = session.players.get(resolution.tribunalTargetUuid)
        if (!defendant || defendant.alive !== true) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    session.dayVoteResolution = resolution
    if (resolution.outcome === 'TRIBUNAL') {
        session.phase = 'TRIBUNAL'
        session.tribunal = {
            candidateId: resolution.tribunalTargetUuid,
            dayIndex: session.dayIndex,
            defendantUuid: resolution.tribunalTargetUuid,
            votes: new Map(),
        }
    } else if (resolution.outcome === 'REVOTE') {
        session.tribunal = null
        session.dayVoteRound = getResolutionRound(resolution) + 1
        session.dayVoteExcludedUuids = new Set(resolution.revoteExcludedUuids ?? [])
        session.dayVotes = new Map()
        session.dayVoteSfx = new Map()
    } else {
        session.tribunal = null
        session.phase = 'NIGHT'
        session.nightActions = new Map()
        session.nightResolution = null
        session.nightProgress = null
    }
    return { ok: true }
}

// 낮 투표 결과 방송 내용
function buildDayVoteResolvedPayload(session, resolution) {
    return {
        gameId: session.id,
        dayIndex: resolution.dayIndex,
        phase: session.phase,
        round: getResolutionRound(resolution),
        outcome: resolution.outcome,
        tribunalTargetUuid: resolution.tribunalTargetUuid,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
        revoteExcludedUuids: [...(resolution.revoteExcludedUuids ?? [])],
    }
}

module.exports = {
    prepareDayVoteResolution,
    commitDayVoteResolution,
    buildDayVoteResolvedPayload,
}