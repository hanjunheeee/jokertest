// 방 만들기 설정 검사 파일, 고를 수 있는 값 표 + 방 만들기 요청 검사 (직업별 밤 시간 포함)
// socket/matchmaking/join/create.js가 부름 (역할 구성은 거기서 따로), 값 표는 updateSettings.js도 같이 씀
const ALLOWED_ACCESS_TYPES = ['open', 'code']

// 고를 수 있는 값 (그 밖 숫자는 거절)
const ALLOWED_MAX_PLAYERS = Object.freeze([4, 5, 6, 7, 8, 9, 10])
const ALLOWED_JOKER_COUNT = Object.freeze([1, 2, 3, 4])
const ALLOWED_DAY_DISCUSSION_TIME = Object.freeze([30, 60, 90, 120, 150])
const ALLOWED_DAY_VOTE_TIME = Object.freeze([30, 60, 90])
const ALLOWED_NIGHT_ACTION_TIME = Object.freeze([30, 60, 90, 120])

// 직업별 밤 시간 정할 수 있는 역할 (시민은 밤 행동 없음), 값은 전체 밤 시간과 같은 표
const ROLE_NIGHT_ACTION_TIME_KEYS = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
const ALLOWED_ROLE_NIGHT_ACTION_TIME = ALLOWED_NIGHT_ACTION_TIME

// 참·거짓 값인지
function isBoolean(value) {
    return typeof value === 'boolean'
}

// 없으면 통과, 있으면 아는 역할·허용 값만 새 객체로 옮김 (받은 객체 그대로 안 씀)
function validateRoleNightActionTimes(raw) {
    if (raw === undefined) return { ok: true, value: undefined }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return { ok: false, message: '직업별 밤 행동 시간 값이 올바르지 않습니다.' }
    }

    const value = {}
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

// 칸마다 허용 값인지 보고, 맞으면 공개 방식 · 설정 둘로 나눠 돌려줌
function validateCreateRoomPayload(payload) {
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

    if (!ALLOWED_ACCESS_TYPES.includes(accessType)) {
        return { ok: false, message: '공개 방식 값이 올바르지 않습니다.' }
    }
    if (!ALLOWED_MAX_PLAYERS.includes(maxPlayers)) {
        return { ok: false, message: '최대 플레이어 수가 올바르지 않습니다.' }
    }
    if (!ALLOWED_JOKER_COUNT.includes(jokerCount)) {
        return { ok: false, message: '광대 플레이어 수가 올바르지 않습니다.' }
    }
    // 광대가 정원 이상이면 시민 쪽 자리가 없음
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
    const roleTimes = validateRoleNightActionTimes(roleNightActionTimes)
    if (!roleTimes.ok) return roleTimes

    // 받은 본문 말고 검사한 칸만 새로 담음, 직업별 밤 시간은 보냈을 때만
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
