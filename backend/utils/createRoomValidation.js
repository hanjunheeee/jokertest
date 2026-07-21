const ALLOWED_ACCESS_TYPES = ['open', 'code']

// 프런트 GENERAL_GAME_SETUP/MEETING_GAME_SETUP(설정 화면)의 스테퍼 항목과 정확히 같은 값이어야 한다.
// max-players는 min4~max10에 step 지정이 없어 SetupStepperRow 기본 step(1)이 적용된다.
// 프런트 스테퍼의 범위/step이 바뀌면 이 배열들도 함께 바꿔야 한다 — 계약이 어긋나면
// 정상적인 UI 선택값도 서버가 거부하게 된다.
const ALLOWED_MAX_PLAYERS = Object.freeze([4, 5, 6, 7, 8, 9, 10])
const ALLOWED_JOKER_COUNT = Object.freeze([1, 2, 3, 4])
const ALLOWED_DAY_DISCUSSION_TIME = Object.freeze([30, 60, 90, 120, 150])
const ALLOWED_DAY_VOTE_TIME = Object.freeze([30, 60, 90])
const ALLOWED_NIGHT_ACTION_TIME = Object.freeze([30, 60, 90, 120])

function isBoolean(value) {
    return typeof value === 'boolean'
}

/**
 * create_room payload를 검증합니다. 잘못된 값을 clamp/보정하지 않고 명시적으로 거부합니다.
 * @param {unknown} payload - 클라이언트가 보낸 값(신뢰하지 않음)
 * @returns {{ok:true, value:{accessType:string, settings:object}} | {ok:false, message:string}}
 */
function validateCreateRoomPayload(payload) {
    // 구조분해 전에 객체 형태부터 확인한다. null/배열/문자열 등을 그대로 구조분해하면
    // 예외가 나거나(null) 전부 undefined로 통과해(문자열 등) 검증이 무력화될 수 있다.
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return { ok: false, message: '잘못된 요청입니다.' }
    }

    const {
        accessType,
        maxPlayers,
        jokerCount,
        lightsOut,
        soulBetting,
        dayDiscussionTime,
        dayVoteTime,
        nightActionTime,
        voteReveal,
    } = payload
    // uuid/hostUuid/players/id/code/title/status/createdAt 등은 여기서 아예 읽지 않는다.
    // "서버 권한 필드는 클라이언트 입력을 신뢰하지 않는다"는 원칙을 구조상으로 강제하기 위함이다.

    if (!ALLOWED_ACCESS_TYPES.includes(accessType)) {
        return { ok: false, message: '공개 방식 값이 올바르지 않습니다.' }
    }
    if (!ALLOWED_MAX_PLAYERS.includes(maxPlayers)) {
        return { ok: false, message: '최대 플레이어 수가 올바르지 않습니다.' }
    }
    if (!ALLOWED_JOKER_COUNT.includes(jokerCount)) {
        return { ok: false, message: '광대 플레이어 수가 올바르지 않습니다.' }
    }
    // 개별 범위 검증만으로는 광대 수가 전체 인원과 같거나 많은 조합을 걸러낼 수 없어
    // 두 필드를 함께 보는 교차 검증이 따로 필요하다.
    if (jokerCount >= maxPlayers) {
        return { ok: false, message: '광대 수는 최대 플레이어 수보다 적어야 합니다.' }
    }
    if (!isBoolean(lightsOut)) return { ok: false, message: '불이 꺼진 무도회 값이 올바르지 않습니다.' }
    if (!isBoolean(soulBetting)) return { ok: false, message: '영혼의 베팅 값이 올바르지 않습니다.' }
    if (!isBoolean(voteReveal)) return { ok: false, message: '투표 공개 여부 값이 올바르지 않습니다.' }
    if (!ALLOWED_DAY_DISCUSSION_TIME.includes(dayDiscussionTime)) {
        return { ok: false, message: '낮 토론 시간 값이 올바르지 않습니다.' }
    }
    if (!ALLOWED_DAY_VOTE_TIME.includes(dayVoteTime)) {
        return { ok: false, message: '낮 투표 시간 값이 올바르지 않습니다.' }
    }
    if (!ALLOWED_NIGHT_ACTION_TIME.includes(nightActionTime)) {
        return { ok: false, message: '밤 행동 시간 값이 올바르지 않습니다.' }
    }

    return {
        ok: true,
        value: {
            accessType,
            settings: {
                maxPlayers,
                jokerCount,
                lightsOut,
                soulBetting,
                dayDiscussionTime,
                dayVoteTime,
                nightActionTime,
                voteReveal,
            },
        },
    }
}

module.exports = {
    validateCreateRoomPayload,
    ALLOWED_MAX_PLAYERS,
    ALLOWED_JOKER_COUNT,
    ALLOWED_DAY_DISCUSSION_TIME,
    ALLOWED_DAY_VOTE_TIME,
    ALLOWED_NIGHT_ACTION_TIME,
}
