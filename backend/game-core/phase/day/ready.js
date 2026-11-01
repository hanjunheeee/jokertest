// 낮 준비 파일
// 토론 끝내기 준비 확인 + 낮 상태 읽기, socket 쪽이 사용 (낮 단계 방송은 payloads.js)
const { getSessionById } = require('../../queries')
const { getDayVoteRound, getDayPhase, enterDayVotePhase, getDayVoteReadyUuids } = require('./state')
const { findActorSession } = require('../../core/registry/lookup')
const { DAY_PHASES } = require('./constants')
const { getEligibleDayVoterUuids } = require('./ballots')

// 판의 지금 날짜
function getSessionDayIndex(gameId) {
    const session = getSessionById(gameId)
    return session ? session.dayIndex : null
}

// 판의 지금 투표 번호
function getSessionDayVoteRound(gameId) {
    const session = getSessionById(gameId)
    return session ? getDayVoteRound(session) : null
}

// "투표하자" 누른 사람 기록, 전원 누르면 투표로 넘김
function acknowledgeDayVoteReady(uuid, gameId) {
    // 판 id 확인 + 내 판·판 안의 나 찾기, 끝난 판이면 거절
    const found = findActorSession(uuid, gameId, { checkEnded: true })
    if (!found.ok) return found
    const { session, actor } = found

    // 낮 토론 중일 때만, 산 사람만
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.DISCUSSION) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    // 준비 명단 없으면 새로 만들어 붙임
    const eligibleUuids = getEligibleDayVoterUuids(session)
    const readyUuids = getDayVoteReadyUuids(session)
    session.dayVoteReadyUuids = readyUuids
    // 산 사람 중 누른 사람만 셈 (죽은 사람 기록은 안 셈)
    const countReady = () => eligibleUuids.filter((eligibleUuid) => readyUuids.has(eligibleUuid)).length

    // 이미 눌렀으면 아무것도 안 바꾸고 ok만 (지도 04-⑥)
    if (readyUuids.has(uuid)) {
        return { ok: true, transitioned: false, session, readyCount: countReady(), requiredCount: eligibleUuids.length }
    }

    // 여기부터 진짜 바뀜: 준비 명단에 나 추가
    readyUuids.add(uuid)
    const readyCount = countReady()
    // 산 사람 전원 눌렀으면 투표 단계로
    if (readyCount === eligibleUuids.length) {
        enterDayVotePhase(session)
        return { ok: true, transitioned: true, session, readyCount, requiredCount: eligibleUuids.length }
    }
    return { ok: true, transitioned: false, session, readyCount, requiredCount: eligibleUuids.length }
}

module.exports = {
    getSessionDayIndex,
    getSessionDayVoteRound,
    acknowledgeDayVoteReady,
}