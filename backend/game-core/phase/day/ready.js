// 낮 준비 파일
// 토론 끝내기 준비 확인 + 낮 상태 알리기, socket 쪽이 사용
const { gameSessions, playerSession } = require('../../core/state')
const { getDayVoteRound, getDayPhase, enterDayVotePhase } = require('./state')
const { assertSessionNotEnded } = require('../../core/terminal')
const { DAY_PHASES } = require('./constants')
const { getEligibleDayVoterUuids } = require('./ballots')

// 판의 지금 날짜
function getSessionDayIndex(gameId) {
    const session = gameSessions.get(gameId)
    return session ? session.dayIndex : null
}

// 판의 지금 투표 번호
function getSessionDayVoteRound(gameId) {
    const session = gameSessions.get(gameId)
    return session ? getDayVoteRound(session) : null
}

// "투표하자" 누른 사람 기록, 전원 누르면 투표로 넘김
function acknowledgeDayVoteReady(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.DISCUSSION) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    const eligibleUuids = getEligibleDayVoterUuids(session)
    const readyUuids = session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
    session.dayVoteReadyUuids = readyUuids
    const countReady = () => eligibleUuids.filter((eligibleUuid) => readyUuids.has(eligibleUuid)).length

    if (readyUuids.has(uuid)) {
        return { ok: true, transitioned: false, session, readyCount: countReady(), requiredCount: eligibleUuids.length }
    }

    readyUuids.add(uuid)
    const readyCount = countReady()
    if (readyCount === eligibleUuids.length) {
        enterDayVotePhase(session)
        return { ok: true, transitioned: true, session, readyCount, requiredCount: eligibleUuids.length }
    }
    return { ok: true, transitioned: false, session, readyCount, requiredCount: eligibleUuids.length }
}

// 낮 단계 바뀜 방송 내용
function buildDayPhaseChangedPayload(session) {
    return {
        gameId: session.id,
        dayIndex: session.dayIndex,
        dayPhase: getDayPhase(session),
        round: getDayVoteRound(session),
    }
}

module.exports = {
    getSessionDayIndex,
    getSessionDayVoteRound,
    acknowledgeDayVoteReady,
    buildDayPhaseChangedPayload,
}