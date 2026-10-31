// 낮 표 받기 파일
// 낮 투표 받기 + 투표 효과음 이벤트, socket 쪽이 gameSession.js 통해서 사용
const { playerSession, gameSessions } = require('../../core/state')
const { getResolutionRound, getDayVoteRound, getDayPhase, getDayVoteExcludedUuids } = require('./state')
const { DAY_PHASES } = require('./constants')

// 낮 표 받기 (투표 단계, 산 사람, 뽑을 수 있는 사람만)
function submitDayVote(uuid, gameId, targetId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return { ok: false, code: 'INVALID_GAME_ID' }
    if (targetId !== null && (typeof targetId !== 'string' || targetId.length === 0)) {
        return { ok: false, code: 'INVALID_TARGET' }
    }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== gameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (
        session.dayVoteResolution !== null &&
        session.dayVoteResolution.dayIndex === session.dayIndex &&
        getResolutionRound(session.dayVoteResolution) === getDayVoteRound(session)
    ) {
        return { ok: false, code: 'DAY_VOTE_ALREADY_RESOLVED' }
    }
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    if (targetId !== null) {
        const target = session.players.get(targetId)
        if (!target) return { ok: false, code: 'INVALID_TARGET' }
        if (!target.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        if (targetId === uuid) return { ok: false, code: 'SELF_TARGET_NOT_ALLOWED' }
        if (getDayVoteExcludedUuids(session).has(targetId)) {
            return { ok: false, code: 'TARGET_EXCLUDED_FROM_REVOTE' }
        }
    }

    const isFirstSubmission = !session.dayVotes.has(uuid)
    session.dayVotes.set(uuid, targetId)
    advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission)
    return { ok: true }
}

// 표 낼 때마다 효과음 번호 올림
function advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission) {
    const dayIndex = session.dayIndex
    const round = getDayVoteRound(session)
    const previous = session.dayVoteSfx instanceof Map ? session.dayVoteSfx.get(uuid) : undefined
    const inSameScope =
        previous !== undefined && previous.dayIndex === dayIndex && previous.round === round

    if (inSameScope && !isFirstSubmission && previous.targetId === targetId) return

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
function readDayVoteSubmitSfxEvent(uuid, gameId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return null
    const session = gameSessions.get(gameId)
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
    readDayVoteSubmitSfxEvent,
}