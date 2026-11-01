// 낮 표 받기 파일
// 낮 투표 받기 + 투표 효과음 이벤트, socket 쪽이 gameSession.js 통해서 사용
const { normalizeGameId, findSessionForActor } = require('../../core/registry/lookup')
const { isVoteRoundResolved, getDayVoteRound, getDayPhase, getDayVoteExcludedUuids } = require('./state')
const { DAY_PHASES } = require('./constants')
const { getSessionById } = require('../../queries/byId')

// 낮 표 받기 (투표 단계, 산 사람, 뽑을 수 있는 사람만)
function submitDayVote(uuid, gameId, targetId) {
    // 요청에 온 판 id(공백 안 자름)·찍은 사람 모양 확인 (null = 기권)
    // 찍은 사람 모양은 판 찾기 전에 봄
    const normalizedGameId = normalizeGameId(gameId, { trim: false })
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (targetId !== null && (typeof targetId !== 'string' || targetId.length === 0)) {
        return { ok: false, code: 'INVALID_TARGET' }
    }

    // 지금 내가 있는 판이랑 같은지, 판이랑 판 안의 나 찾기
    const found = findSessionForActor(uuid, normalizedGameId)
    if (!found.ok) return found
    const { session, actor } = found

    // 이번 투표가 이미 판정 끝났으면 거절
    if (isVoteRoundResolved(session)) return { ok: false, code: 'DAY_VOTE_ALREADY_RESOLVED' }
    // 낮 투표 단계일 때만, 산 사람만
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    // 찍은 사람 검사, 기권(null)이면 건너뜀 (지도 04-②)
    if (targetId !== null) {
        const target = session.players.get(targetId)
        if (!target) return { ok: false, code: 'INVALID_TARGET' }
        if (!target.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        // 나 자신·재투표에서 빠진 사람은 못 찍음
        if (targetId === uuid) return { ok: false, code: 'SELF_TARGET_NOT_ALLOWED' }
        if (getDayVoteExcludedUuids(session).has(targetId)) {
            return { ok: false, code: 'TARGET_EXCLUDED_FROM_REVOTE' }
        }
    }

    // 여기부터 진짜 바뀜: 표 적기 (다시 내면 덮어씀), 효과음 번호 올림
    const isFirstSubmission = !session.dayVotes.has(uuid)
    session.dayVotes.set(uuid, targetId)
    advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission)
    return { ok: true }
}

// 표 낼 때마다 효과음 번호 올림
function advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission) {
    // 같은 날·같은 투표 번호의 앞 기록인지
    const dayIndex = session.dayIndex
    const round = getDayVoteRound(session)
    const previous = session.dayVoteSfx instanceof Map ? session.dayVoteSfx.get(uuid) : undefined
    const inSameScope =
        previous !== undefined && previous.dayIndex === dayIndex && previous.round === round

    // 같은 대상 다시 내면 효과음 안 울림
    if (inSameScope && !isFirstSubmission && previous.targetId === targetId) return

    // 같은 범위면 번호 +1, 새 날·새 투표면 1부터
    const revision = inSameScope ? previous.revision + 1 : 1
    if (!(session.dayVoteSfx instanceof Map)) session.dayVoteSfx = new Map()
    session.dayVoteSfx.set(
        uuid,
        Object.freeze({
            dayIndex,
            round,
            targetId,
            revision,
            eventId: `game:${session.id}:day:${dayIndex}:round:${round}:actor:${uuid}:vote:${revision}`,
        }),
    )
}

// 투표 효과음 이벤트 꺼내기
function readDayVoteSfx(uuid, gameId) {
    // 판 id·판·내 기록 없으면 효과음 없음
    if (!normalizeGameId(gameId, { trim: false })) return null
    const session = getSessionById(gameId)
    if (!session || !(session.dayVoteSfx instanceof Map)) return null
    const record = session.dayVoteSfx.get(uuid)
    if (record === undefined) return null
    return Object.freeze({
        dayIndex: record.dayIndex,
        round: record.round,
        revision: record.revision,
        eventId: record.eventId,
    })
}

module.exports = {
    submitDayVote,
    advanceDayVoteSfx,
    readDayVoteSfx,
}