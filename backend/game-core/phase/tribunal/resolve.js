// 재판 판정 파일
// 재판 판정 prepare/commit (결과 방송 내용은 phase/tribunal/payloads.js)
// prepare = 표 세서 결과만 정함, commit = 그사이 표 안 바뀌었는지 보고 확정 (지도 04-⑦)
const { normalizeGameId, findSessionForActor } = require('../../core/lookup')
const { isRegisteredSession } = require('../../queries')
const { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession } = require('../../core/terminal')
const { enterNightPhase } = require('../../core/phase')
const { DEATH_REASONS } = require('../../result')
const { TRIBUNAL_PENDING, getEligibleTribunalVoterUuids, buildTribunalBallotSnapshot, tallyTribunalBallots, isSameBallots, } = require('./ballots')

// 재판 판정 준비: 표 세서 결과 정하고 보관함에 넣음, 아직 확정 안 함
function prepareTribunalVoteResolution(uuid, gameId, dayIndex) {
    // 요청에 온 판 id·날짜 확인 (날짜는 판 찾기 전에 봄)
    const normalizedGameId = normalizeGameId(gameId)
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }

    // 내 판 찾기, 내가 판에 있는지, 끝난 판이면 거절
    const found = findSessionForActor(uuid, normalizedGameId, { requireActor: false, checkEnded: true })
    if (!found.ok) return found
    const { session } = found

    // 오늘 재판 중일 때만
    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }
    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }

    // 재판 상태가 제대로 있는지 (후보 id·피고 있어야 함), 이미 끝난 재판이면 거절
    const tribunal = session.tribunal
    if (
        !tribunal ||
        typeof tribunal.candidateId !== 'string' ||
        tribunal.candidateId.length === 0 ||
        typeof tribunal.defendantUuid !== 'string' ||
        tribunal.defendantUuid.length === 0
    ) {
        return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    // 투표할 사람이 전부 냈는지
    const eligibleVoterUuids = getEligibleTribunalVoterUuids(session, tribunal.defendantUuid)
    for (const voterUuid of eligibleVoterUuids) {
        if (!tribunal.votes.has(voterUuid)) return { ok: false, code: 'TRIBUNAL_VOTES_INCOMPLETE' }
    }

    // 지금 표 묶음 만들고 얼림 (나중에 비교용)
    const ballotSnapshot = buildTribunalBallotSnapshot(session, tribunal)
    for (const entry of ballotSnapshot) Object.freeze(entry)
    Object.freeze(ballotSnapshot)

    // 표 세서 결과 만들기 (유죄면 처형할 사람까지)
    const tally = tallyTribunalBallots(ballotSnapshot, tribunal.defendantUuid)
    const resolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        defendantUuid: tribunal.defendantUuid,
        outcome: tally.outcome,
        counts: Object.freeze({ guilty: tally.counts.guilty, notGuilty: tally.counts.notGuilty }),
        executedUuid: tally.executedUuid,
        ballotSnapshot,
    }
    Object.freeze(resolution)

    // 보관함에 넣어 둠, commit이 이거랑 비교
    TRIBUNAL_PENDING.set(session, { resolution, ballotSnapshot })

    return { ok: true, session, resolution }
}

// 재판 판정 확정: 보관함이랑 지금 표 같은지 보고 유죄면 처형, 승패 판정
function commitTribunalVoteResolution(session, resolution) {
    // 그사이 판이 끝났으면 거절
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    // 진짜 판 장부에 있는 그 판인지, 아직 같은 날 재판 중인지
    if (!isRegisteredSession(session)) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (session.dayIndex !== resolution.dayIndex) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    // 같은 피고·같은 날 재판이고 아직 안 끝났는지
    const tribunal = session.tribunal
    if (!tribunal || tribunal.defendantUuid !== resolution.defendantUuid || tribunal.dayIndex !== resolution.dayIndex) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    // 그사이 피고가 나갔거나 죽었으면 거절
    const defendant = session.players.get(resolution.defendantUuid)
    if (!defendant || !defendant.alive) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    // prepare가 넣은 그 결과인지 (다시 prepare했으면 옛 결과는 거절)
    const record = TRIBUNAL_PENDING.get(session)
    if (!record || record.resolution !== resolution) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    // 지금 표가 prepare 때 표랑 같은지
    const currentBallotSnapshot = buildTribunalBallotSnapshot(session, tribunal)
    if (!isSameBallots(currentBallotSnapshot, record.ballotSnapshot)) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    // 다시 세도 결과가 같은지
    const tally = tallyTribunalBallots(currentBallotSnapshot, tribunal.defendantUuid)
    if (
        tally.outcome !== resolution.outcome ||
        tally.counts.guilty !== resolution.counts.guilty ||
        tally.counts.notGuilty !== resolution.counts.notGuilty ||
        tally.executedUuid !== resolution.executedUuid
    ) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    // 여기부터 진짜 바뀜: 유죄면 처형, 재판 결과 기록
    if (resolution.outcome === 'GUILTY') {
        defendant.alive = false
        defendant.deathReason = DEATH_REASONS.EXECUTION
    }
    tribunal.outcome = resolution.outcome
    tribunal.counts = { guilty: resolution.counts.guilty, notGuilty: resolution.counts.notGuilty }
    tribunal.executedUuid = resolution.executedUuid
    tribunal.resolved = true

    // 다 쓴 보관함 비움
    TRIBUNAL_PENDING.delete(session)

    // 승패 나면 판 닫기
    const winResult = evaluateWinCondition(session)
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, terminal: { winner: winResult.winner } }
    }

    // 승패 안 나면 밤으로, 밤 기록 새로 시작
    enterNightPhase(session)
    return { ok: true, terminal: null }
}

module.exports = { prepareTribunalVoteResolution, commitTribunalVoteResolution }