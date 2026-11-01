// 재판 투표 받기 파일
// 유죄·무죄 표 받기 + 효과음 이벤트, socket 쪽이 gameSession.js 통해서 사용
const { normalizeGameId, findActorSession } = require('../../core/registry/lookup')
const { getSessionById } = require('../../queries')

// 재판 표 받기 (재판 중, 투표 자격 있는 사람만)
function submitTribunalVote(uuid, gameId, dayIndex, vote) {
    // 판 id 확인(공백 안 자름) + 내 판·판 안의 나 찾기
    const found = findActorSession(uuid, gameId, { trim: false })
    if (!found.ok) return found
    const { session, actor } = found

    // 오늘 날짜 표인지 (지난 날 화면에서 보낸 것 거절)
    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }
    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }

    // 재판 중일 때만
    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }

    // 재판 상태가 오늘 것이고 아직 안 끝났는지
    const tribunal = session.tribunal
    if (!tribunal) return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    if (tribunal.dayIndex !== session.dayIndex) return { ok: false, code: 'TRIBUNAL_CONTEXT_MISMATCH' }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    // 낮 투표 결과가 이 재판(같은 날·같은 피고)으로 이어진 게 맞는지
    const resolution = session.dayVoteResolution
    if (!resolution) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (resolution.outcome !== 'TRIBUNAL') return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (resolution.dayIndex !== session.dayIndex || resolution.dayIndex !== tribunal.dayIndex) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }
    if (resolution.tribunalTargetUuid !== tribunal.defendantUuid) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    // 피고가 있고 살아 있는지
    const defendantUuid = tribunal.defendantUuid
    if (typeof defendantUuid !== 'string' || defendantUuid.length === 0) {
        return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    }
    const defendant = session.players.get(defendantUuid)
    if (!defendant || !defendant.alive) return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }

    // 산 사람만, 피고 본인은 못 찍음
    if (!actor.alive) return { ok: false, code: 'PLAYER_NOT_ALIVE' }
    if (uuid === defendantUuid) return { ok: false, code: 'DEFENDANT_CANNOT_VOTE' }

    // 유죄·무죄 둘 중 하나만
    if (vote !== 'GUILTY' && vote !== 'NOT_GUILTY') return { ok: false, code: 'INVALID_TRIBUNAL_VOTE' }

    // 한 사람 한 표, 바꾸기 없음
    if (tribunal.votes.has(uuid)) return { ok: false, code: 'TRIBUNAL_VOTE_ALREADY_SUBMITTED' }

    // 여기부터 진짜 바뀜: 내 표 적기
    tribunal.votes.set(uuid, vote)
    return { ok: true, gameId: session.id, dayIndex: session.dayIndex, vote: tribunal.votes.get(uuid) }
}

// 투표 효과음 이벤트 꺼내기 (이미 표 낸 사람만, 같은 표는 같은 id라 두 번 안 울림)
function readTribunalVoteSubmitSfxEvent(uuid, gameId) {
    // 판·재판·내 표 없으면 효과음 없음
    if (!normalizeGameId(gameId, { trim: false })) return null
    const session = getSessionById(gameId)
    if (!session) return null
    const tribunal = session.tribunal
    if (!tribunal || !(tribunal.votes instanceof Map)) return null
    if (!tribunal.votes.has(uuid)) return null
    const dayIndex = tribunal.dayIndex
    if (!Number.isInteger(dayIndex)) return null
    return Object.freeze({
        dayIndex,
        eventId: `game:${session.id}:day:${dayIndex}:actor:${uuid}:tribunal-submitted`,
    })
}

module.exports = { submitTribunalVote, readTribunalVoteSubmitSfxEvent }