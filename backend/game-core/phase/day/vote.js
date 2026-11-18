// 낮 표 받기 파일
// 낮 투표 받기·표 거두기 + 투표 효과음 이벤트, socket 쪽이 gameSession.js 통해서 사용
const { normalizeGameId, findSessionForActor } = require('../../core/registry/lookup')
const { isVoteRoundResolved, getDayVoteRound, getDayPhase } = require('./state')
const { DAY_PHASES } = require('./constants')
const { getSessionById } = require('../../queries/byId')

// 낮 표 낼 사람 찾기: 지금 내가 있는 판인지, 이번 투표가 안 끝났는지, 낮 투표 단계인지, 산 사람인지
// 통과면 { ok: true, session, actor }, 아니면 거절 코드 (표 내기·거두기가 같이 씀)
function findDayVoter(uuid, normalizedGameId) {
    // 끝난 판이면 다른 검사보다 먼저 GAME_ALREADY_ENDED로 거절 (끝난 판 요청은 거절 코드 하나로)
    const found = findSessionForActor(uuid, normalizedGameId, { checkEnded: true })
    if (!found.ok) return found
    const { session, actor } = found

    // 이번 투표가 이미 판정 끝났으면 거절
    if (isVoteRoundResolved(session)) return { ok: false, code: 'DAY_VOTE_ALREADY_RESOLVED' }
    // 낮 투표 단계일 때만, 산 사람만
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }
    return found
}

// 낮 표 받기 (투표 단계, 산 사람, 뽑을 수 있는 사람만)
function submitDayVote(uuid, gameId, targetId) {
    // 요청에 온 판 id(공백 안 자름)·찍은 사람 모양 확인 (null = 기권)
    // 찍은 사람 모양은 판 찾기 전에 봄
    const normalizedGameId = normalizeGameId(gameId, { trim: false })
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (targetId !== null && (typeof targetId !== 'string' || targetId.length === 0)) {
        return { ok: false, code: 'INVALID_TARGET' }
    }

    // 판·나·단계·생존 검사 (표 거두기와 같은 검사)
    const found = findDayVoter(uuid, normalizedGameId)
    if (!found.ok) return found
    const { session } = found

    // 찍은 사람 검사, 기권(null)이면 건너뜀 (지도 04-②)
    if (targetId !== null) {
        const target = session.players.get(targetId)
        if (!target) return { ok: false, code: 'INVALID_TARGET' }
        if (!target.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        // 나 자신은 못 찍음
        if (targetId === uuid) return { ok: false, code: 'SELF_TARGET_NOT_ALLOWED' }
    }

    // 여기부터 진짜 바뀜: 표 적기 (다시 내면 덮어씀), 효과음 번호 올림
    const isFirstSubmission = !session.dayVotes.has(uuid)
    session.dayVotes.set(uuid, targetId)
    advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission)
    return { ok: true }
}

// 낸 표 거두기: 내 표 칸을 지워 "안 낸 사람"으로 돌림 (사용자 결정 2026-11-18, "투표취소")
// 진행 수가 1 줄고, 다시 내거나 기권할 수 있음, 마감까지 안 내면 마감이 기권으로 채움
// 안 낸 채 거두면 바뀌는 것 없이 통과 ({ withdrawn: false }), 투표 참여 기록(업적)은 안 지움
// 예: 표 X 낸 뒤 → { ok: true, withdrawn: true }, 안 낸 뒤 → { ok: true, withdrawn: false }
function withdrawDayVote(uuid, gameId) {
    // 요청에 온 판 id(공백 안 자름) 확인
    const normalizedGameId = normalizeGameId(gameId, { trim: false })
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    // 표 낼 때와 같은 검사 (판·나·판정 전·낮 투표 단계·산 사람)
    const found = findDayVoter(uuid, normalizedGameId)
    if (!found.ok) return found
    const { session } = found

    // 낸 표가 없으면 그대로 통과
    if (!session.dayVotes.has(uuid)) return { ok: true, withdrawn: false }

    // 여기부터 진짜 바뀜: 표 칸 지우기 (거둘 땐 효과음 없음·효과음 번호도 안 올림, 2026-11-18 정함)
    session.dayVotes.delete(uuid)
    return { ok: true, withdrawn: true }
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
    withdrawDayVote,
    advanceDayVoteSfx,
    readDayVoteSfx,
}