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

// 직업별 밤 제한시간을 지정할 수 있는 역할 키. game-core의 NIGHT_TURN_ORDER(밤 턴이 도는
// 역할)와 같은 집합이어야 한다 — 턴이 없는 역할의 시간을 받아봐야 어떤 턴 길이도 바꾸지
// 못하고, 클라이언트가 아무 키나 실어 보내는 통로만 열어주게 된다.
const ROLE_NIGHT_ACTION_TIME_KEYS = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
// 직업별 값의 허용 집합. 전체 밤 행동 시간과 같은 목록을 쓴다 — 프런트가 같은 스테퍼 범위·
// step으로 그리므로, 두 목록이 갈리면 정상적인 UI 선택값이 서버에서 거부된다.
const ALLOWED_ROLE_NIGHT_ACTION_TIME = ALLOWED_NIGHT_ACTION_TIME

function isBoolean(value) {
    return typeof value === 'boolean'
}

/**
 * 직업별 밤 제한시간(roleNightActionTimes)을 검증합니다. 다른 필드와 마찬가지로 clamp/보정 없이
 * 거부하되, "지정하지 않음"은 정상 입력으로 통과시킵니다 — 값이 없는 직업의 턴 길이는 서버가
 * nightActionTime으로 폴백하기 때문입니다(필드 자체를 생략해도, 일부 직업만 지정해도 됩니다).
 *
 * @param {unknown} raw - payload.roleNightActionTimes(신뢰하지 않음)
 * @returns {{ok:true, value:object|undefined} | {ok:false, message:string}}
 *          value가 undefined면 settings에 이 필드를 싣지 않는다(전 직업 폴백).
 */
function validateRoleNightActionTimes(raw) {
    if (raw === undefined) return { ok: true, value: undefined }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return { ok: false, message: '직업별 밤 행동 시간 값이 올바르지 않습니다.' }
    }

    const value = {}
    // 클라이언트가 보낸 객체를 그대로 저장하지 않고, 알려진 키만 골라 새 객체로 다시 만든다
    // (roleCounts와 같은 원칙 — 서버가 저장하는 값의 형태를 서버가 결정한다).
    for (const key of Object.keys(raw)) {
        if (!ROLE_NIGHT_ACTION_TIME_KEYS.includes(key)) {
            return { ok: false, message: '직업별 밤 행동 시간 값이 올바르지 않습니다.' }
        }
        if (!ALLOWED_ROLE_NIGHT_ACTION_TIME.includes(raw[key])) {
            return { ok: false, message: '직업별 밤 행동 시간 값이 올바르지 않습니다.' }
        }
        value[key] = raw[key]
    }
    return { ok: true, value }
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
        roleNightActionTimes,
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
    // 직업별 값은 전체 밤 행동 시간을 통과한 뒤에 본다 — 폴백 대상(nightActionTime)이 먼저
    // 유효해야 "값이 없는 직업"의 턴 길이가 정의된다.
    const roleTimes = validateRoleNightActionTimes(roleNightActionTimes)
    if (!roleTimes.ok) return roleTimes

    const settings = {
        maxPlayers,
        jokerCount,
        lightsOut,
        soulBetting,
        dayDiscussionTime,
        dayVoteTime,
        nightActionTime,
        voteReveal,
    }
    // 지정이 없으면 키 자체를 만들지 않는다 — 빈 객체를 실어 보내면 "전 직업 폴백"과 "빈
    // 객체를 명시적으로 지정함"이 저장된 방 설정에서 구별되지 않는다.
    if (roleTimes.value !== undefined) settings.roleNightActionTimes = roleTimes.value

    return { ok: true, value: { accessType, settings } }
}

module.exports = {
    validateCreateRoomPayload,
    validateRoleNightActionTimes,
    ROLE_NIGHT_ACTION_TIME_KEYS,
    ALLOWED_ROLE_NIGHT_ACTION_TIME,
    ALLOWED_MAX_PLAYERS,
    ALLOWED_JOKER_COUNT,
    ALLOWED_DAY_DISCUSSION_TIME,
    ALLOWED_DAY_VOTE_TIME,
    ALLOWED_NIGHT_ACTION_TIME,
}
