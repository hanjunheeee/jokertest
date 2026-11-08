// 낮 판정 파일
// 낮 투표 판정 prepare/commit, socket 쪽이 사용 (지도 04)
// 결과 방송 내용은 phase/day/payloads.js
const { normalizeGameId, findSessionForActor } = require('../../core/registry/lookup')
const { isRegisteredSession } = require('../../queries/byId')
const { assertSessionNotEnded, enterNightPhase } = require('../../core/rules/terminal')
const { getDayVoteRound, getResolutionRound, getDayPhase, isVoteRoundResolved } = require('./state')
const { DAY_PHASES } = require('./constants')
const { getDayVoterUuids, tallyDayVoteOutcome, buildDayBallotSnap, dayBallotSnapsEqual } = require('./ballots')

// 낮 판정 준비: 표 세서 결과 정함, 아직 확정 안 함
function prepareDayVoteResolution(uuid, gameId, dayIndex) {
    // 요청에 온 판 id·날짜 확인 (날짜는 판 찾기 전에 봄)
    const normalizedGameId = normalizeGameId(gameId)
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }

    // 내 판 찾기, 내가 판에 있는지, 끝난 판이면 거절
    const found = findSessionForActor(uuid, normalizedGameId, { requireActor: false, checkEnded: true })
    if (!found.ok) return found
    const { session } = found

    // 오늘 날짜 요청인지
    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }

    // 이번 투표 이미 판정됐으면 결과만 줌, 다시 확정 안 함 (타이머·버튼 겹침, 지도 04-⑥)
    // 요청 날짜 = 오늘 날짜 확인했으니 오늘 기준으로 봐도 같음
    const currentRound = getDayVoteRound(session)
    if (isVoteRoundResolved(session)) {
        return { ok: true, alreadyResolved: true, session, resolution: session.dayVoteResolution }
    }

    // 낮 투표 단계일 때만
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }

    // 산 사람 전부 표 냈는지
    const eligibleVoterUuids = getDayVoterUuids(session)
    for (const voterUuid of eligibleVoterUuids) {
        if (!session.dayVotes.has(voterUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
    }

    // 찍힌 사람이 그사이 나갔거나 죽었으면 거절
    for (const voterUuid of eligibleVoterUuids) {
        const target = session.dayVotes.get(voterUuid)
        if (target !== null) {
            const targetPlayer = session.players.get(target)
            if (!targetPlayer || !targetPlayer.alive) {
                return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
            }
        }
    }

    // 표 세기: 최다 1명이면 재판, 동률·전원 기권이면 밤 (재투표 없음, 사용자 결정 2026-11-09)
    const tally = tallyDayVoteOutcome(session)
    // 결과만 만들어 돌려줌, 판은 안 바꿈 (표 묶음은 commit 비교용)
    return {
        ok: true,
        session,
        resolution: {
            gameId: session.id,
            dayIndex: session.dayIndex,
            round: currentRound,
            outcome: tally.outcome,
            tribunalTargetUuid: tally.tribunalTargetUuid,
            publicVoteCount: tally.publicVoteCount,
            publicAbstainCount: tally.publicAbstainCount,
            // 재투표 없어 늘 빈 값 (방송 칸은 옛 화면 위해 남김)
            excludedUuids: Object.freeze([]),
            revoteExcludedUuids: Object.freeze([]),
            ballotSnapshot: buildDayBallotSnap(session),
        },
    }
}

// 낮 판정 확정: 그사이 표 안 바뀌었으면 재판·밤 중 하나로
function commitDayVoteResolution(session, resolution) {
    // 그사이 판이 끝났으면 거절
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    // 같은 날·같은 투표 번호 결과인지
    if (resolution.dayIndex !== session.dayIndex || getResolutionRound(resolution) !== getDayVoteRound(session)) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    // 진짜 판 장부에 있는 그 판인지, 아직 낮 투표 중인지
    if (!isRegisteredSession(session)) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    if (session.phase !== 'DAY') return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }

    // 그사이 표 안 낸 사람 생겼거나 찍힌 사람이 죽었으면 거절
    const eligibleVoterUuids = getDayVoterUuids(session)
    for (const voterUuid of eligibleVoterUuids) {
        if (!session.dayVotes.has(voterUuid)) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
        const target = session.dayVotes.get(voterUuid)
        if (target === null) continue
        const targetPlayer = session.players.get(target)
        if (!targetPlayer || !targetPlayer.alive) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    // 다시 세도 결과·수가 같은지
    const recheck = tallyDayVoteOutcome(session)
    if (
        recheck.outcome !== resolution.outcome ||
        recheck.tribunalTargetUuid !== resolution.tribunalTargetUuid ||
        recheck.publicVoteCount !== resolution.publicVoteCount ||
        recheck.publicAbstainCount !== resolution.publicAbstainCount
    ) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    // 지금 표 묶음이 prepare 때랑 같은지 (지도 04-⑦)
    if (!dayBallotSnapsEqual(buildDayBallotSnap(session), resolution.ballotSnapshot)) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    // 재판이면 피고가 아직 살아 있는지
    if (resolution.outcome === 'TRIBUNAL') {
        const defendant = session.players.get(resolution.tribunalTargetUuid)
        if (!defendant || defendant.alive !== true) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    // 여기부터 진짜 바뀜: 판정 결과 기록
    session.dayVoteResolution = resolution
    if (resolution.outcome === 'TRIBUNAL') {
        // 재판으로: 피고 세우고 재판 표 새로
        session.phase = 'TRIBUNAL'
        session.tribunal = {
            candidateId: resolution.tribunalTargetUuid,
            dayIndex: session.dayIndex,
            defendantUuid: resolution.tribunalTargetUuid,
            votes: new Map(),
        }
    } else {
        // 그 외(동률·전원 기권): 바로 밤으로, 밤 기록 새로
        session.tribunal = null
        enterNightPhase(session)
    }
    return { ok: true }
}

module.exports = {
    prepareDayVoteResolution,
    commitDayVoteResolution,
}