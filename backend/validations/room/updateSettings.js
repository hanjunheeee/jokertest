// 방 설정 바꾸기 검사 파일, 바꾸기 요청 검사 + 설정 보기 만들기 + 같은 요청인지 볼 지문
// socket/matchmaking(설정 바꾸기·방 보기·준비·시작)·game-core/setup이 부름 (값 표는 create.js 것)
const {
    validateRoleNightActionTimes,
    ROLE_NIGHT_ACTION_TIME_KEYS,
    ALLOWED_MAX_PLAYERS,
    ALLOWED_JOKER_COUNT,
    ALLOWED_DAY_DISCUSSION_TIME,
    ALLOWED_DAY_VOTE_TIME,
    ALLOWED_NIGHT_ACTION_TIME,
} = require('./create')
const { CUSTOM_ROLE_KEYS, validateCreateRoomRoleComposition } = require('../../game-core/core/rules/roleComposition')

// 공개 방식 (create.js 것과 같은 값)
const ALLOWED_ACCESS_TYPES = Object.freeze(['open', 'code'])

// 설정 바꾸기 socket 사건 이름 (요청 · 결과 다시 묻기 · 바뀜 방송)
const ROOM_SETTINGS_EVENTS = Object.freeze({
    UPDATE_ROOM_SETTINGS: 'update_room_settings',
    GET_ROOM_SETTINGS_UPDATE_RESULT: 'get_room_settings_update_result',
    ROOM_SETTINGS_UPDATED: 'room_settings_updated',
})

// 설정 바꾸기·준비·시작 응답에 같이 쓰는 오류 코드
const ROOM_SETTINGS_ERROR_CODES = Object.freeze({
    INVALID_REQUEST: 'INVALID_REQUEST',
    STALE_SOCKET: 'STALE_SOCKET',
    NOT_IN_ROOM: 'NOT_IN_ROOM',
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    NOT_HOST: 'NOT_HOST',
    ADMISSION_PENDING: 'ADMISSION_PENDING',
    ALREADY_IN_GAME: 'ALREADY_IN_GAME',
    SETTINGS_VERSION_CONFLICT: 'SETTINGS_VERSION_CONFLICT',
    MAX_PLAYERS_BELOW_OCCUPANCY: 'MAX_PLAYERS_BELOW_OCCUPANCY',
    REQUEST_ID_REUSED: 'REQUEST_ID_REUSED',
    UNKNOWN: 'UNKNOWN',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
})

// 방장이 바꿀 수 있는 칸 (이 순서로 지문 만듦)
const EDITABLE_ROOM_SETTING_KEYS = Object.freeze([
    'maxPlayers',
    'jokerCount',
    'roleCompositionMode',
    'roleCounts',
    'dayDiscussionTime',
    'dayVoteTime',
    'nightActionTime',
    'roleNightActionTimes',
])

// 방 만들 때 정하고 안 바뀌는 칸 (바꾸기 때 옛 값을 그대로 이어 붙임)
const PRESERVED_ROOM_SETTING_KEYS = Object.freeze(['lightsOut', 'soulBetting', 'voteReveal'])

// 바꾸기 요청 본문에 올 수 있는 칸 (그 밖 칸 하나라도 있으면 거절)
const UPDATE_REQUEST_TOP_LEVEL_KEYS = Object.freeze([
    'roomId',
    'requestId',
    'expectedSettingsVersion',
    'accessType',
    ...EDITABLE_ROOM_SETTING_KEYS,
])

// 방·요청 id 길이 상한
const MAX_IDENTIFIER_LENGTH = 128

// 배열 아닌 객체인지
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 비어 있지 않고 128자 안, 공백만은 안 됨
function isIdentifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH
        && value.trim().length > 0
}

// 실패 결과 모양 하나로 (code·message)
function fail(code, message) {
    return { ok: false, code, message }
}

// 바꿀 수 있는 칸만 뽑은 보기, 역할 수·직업별 시간은 아는 역할만 (저장된 모르는 칸 안 내보내기)
function buildEditableSettingsView(settings) {
    const source = isPlainObject(settings) ? settings : {}
    const view = {}
    for (const key of EDITABLE_ROOM_SETTING_KEYS) {
        if (key === 'roleCounts' || key === 'roleNightActionTimes') continue
        if (source[key] !== undefined) view[key] = source[key]
    }
    if (isPlainObject(source.roleCounts)) {
        const roleCounts = {}
        for (const role of CUSTOM_ROLE_KEYS) {
            if (source.roleCounts[role] !== undefined) roleCounts[role] = source.roleCounts[role]
        }
        view.roleCounts = roleCounts
    }
    if (isPlainObject(source.roleNightActionTimes)) {
        const roleNightActionTimes = {}
        for (const role of ROLE_NIGHT_ACTION_TIME_KEYS) {
            if (source.roleNightActionTimes[role] !== undefined) {
                roleNightActionTimes[role] = source.roleNightActionTimes[role]
            }
        }
        view.roleNightActionTimes = roleNightActionTimes
    }
    return view
}

// 바꿀 수 있는 칸 + 안 바뀌는 칸 보기 (방 정보·설정 바뀜 방송·시작 내용용)
function buildRoomSettingsView(settings) {
    const source = isPlainObject(settings) ? settings : {}
    const view = buildEditableSettingsView(source)
    for (const key of PRESERVED_ROOM_SETTING_KEYS) {
        if (source[key] !== undefined) view[key] = source[key]
    }
    return view
}

// 저장된 설정에 모르는 칸·모르는 역할이 섞였는지 (섞였으면 부르는 쪽이 보기 모양으로 다시 저장)
function hasDisallowedKeys(settings) {
    if (!isPlainObject(settings)) return false
    for (const key of Object.keys(settings)) {
        if (EDITABLE_ROOM_SETTING_KEYS.includes(key)) continue
        if (PRESERVED_ROOM_SETTING_KEYS.includes(key)) continue
        return true
    }
    if (isPlainObject(settings.roleCounts)
        && Object.keys(settings.roleCounts).some((role) => !CUSTOM_ROLE_KEYS.includes(role))) {
        return true
    }
    if (isPlainObject(settings.roleNightActionTimes)
        && Object.keys(settings.roleNightActionTimes).some((role) => !ROLE_NIGHT_ACTION_TIME_KEYS.includes(role))) {
        return true
    }
    return false
}

// 공개 방식 + 바꿀 수 있는 칸을 정한 순서로 한 줄로 (지금 설정과 같은지 비교용, 키 순서 상관없음)
function fingerprintUpdateSettings(accessType, settings) {
    const parts = [`accessType=${accessType}`]
    for (const key of EDITABLE_ROOM_SETTING_KEYS) {
        const value = settings?.[key]
        if (value === undefined) {
            parts.push(`${key}=`)
            continue
        }
        // 역할 수는 역할 순서 고정, 직업별 시간은 있는 역할만
        if (key === 'roleCounts') {
            parts.push(`roleCounts=${CUSTOM_ROLE_KEYS.map((r) => `${r}:${value[r]}`).join(',')}`)
            continue
        }
        if (key === 'roleNightActionTimes') {
            parts.push(`roleNightActionTimes=${ROLE_NIGHT_ACTION_TIME_KEYS
                .filter((r) => value[r] !== undefined)
                .map((r) => `${r}:${value[r]}`)
                .join(',')}`)
            continue
        }
        parts.push(`${key}=${value}`)
    }
    return parts.join('|')
}

// 기대 버전까지 넣은 요청 지문 (같은 요청 id 다시 오면 내용 같은지 비교, 다르면 거절)
function fingerprintRequest(expectedSettingsVersion, accessType, settings) {
    return `v=${expectedSettingsVersion}|${fingerprintUpdateSettings(accessType, settings)}`
}

// 모르는 칸 → id·버전 → 칸마다 허용 값 → 역할 구성 순, 맞으면 새로 담은 settings
function validateUpdateRoomSettingsPayload(payload) {
    if (!isPlainObject(payload)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
    }

    // 안 바뀌는 칸·모르는 칸이 하나라도 있으면 거절
    for (const key of Object.keys(payload)) {
        if (!UPDATE_REQUEST_TOP_LEVEL_KEYS.includes(key)) {
            return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '변경할 수 없는 설정이 포함되어 있습니다.')
        }
    }

    const {
        roomId,
        requestId,
        expectedSettingsVersion,
        accessType,
        maxPlayers,
        jokerCount,
        dayDiscussionTime,
        dayVoteTime,
        nightActionTime,
        roleNightActionTimes,
    } = payload

    // 방·요청 id, 기대 버전 (1 이상 정수, 그사이 설정이 바뀌었는지 볼 때 씀)
    if (!isIdentifier(roomId)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '방 식별자가 올바르지 않습니다.')
    }
    if (!isIdentifier(requestId)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '요청 식별자가 올바르지 않습니다.')
    }
    if (!Number.isSafeInteger(expectedSettingsVersion) || expectedSettingsVersion < 1) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '설정 버전 값이 올바르지 않습니다.')
    }

    // 칸마다 허용 값인지 (방 만들기와 같은 표), 광대가 정원 이상이면 거절
    if (!ALLOWED_ACCESS_TYPES.includes(accessType)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '공개 방식 값이 올바르지 않습니다.')
    }
    if (!ALLOWED_MAX_PLAYERS.includes(maxPlayers)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '최대 플레이어 수가 올바르지 않습니다.')
    }
    if (!ALLOWED_JOKER_COUNT.includes(jokerCount)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '광대 플레이어 수가 올바르지 않습니다.')
    }
    if (jokerCount >= maxPlayers) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '광대 수는 최대 플레이어 수보다 적어야 합니다.')
    }
    if (!ALLOWED_DAY_DISCUSSION_TIME.includes(dayDiscussionTime)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '낮 토론 시간 값이 올바르지 않습니다.')
    }
    if (!ALLOWED_DAY_VOTE_TIME.includes(dayVoteTime)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '낮 투표 시간 값이 올바르지 않습니다.')
    }
    if (!ALLOWED_NIGHT_ACTION_TIME.includes(nightActionTime)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '밤 행동 시간 값이 올바르지 않습니다.')
    }
    const roleTimes = validateRoleNightActionTimes(roleNightActionTimes)
    if (!roleTimes.ok) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, roleTimes.message)
    }

    // 역할 구성(자동·직접)은 game-core 규칙으로
    const roleComposition = validateCreateRoomRoleComposition(payload, { maxPlayers, jokerCount })
    if (!roleComposition.ok) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, roleComposition.message)
    }

    // 안 바뀌는 칸은 여기 안 담음 (저장할 때 옛 값 이어 붙임)
    const settings = {
        maxPlayers,
        jokerCount,
        dayDiscussionTime,
        dayVoteTime,
        nightActionTime,
        ...roleComposition.value,
    }
    if (roleTimes.value !== undefined) settings.roleNightActionTimes = roleTimes.value

    return {
        ok: true,
        value: {
            roomId,
            requestId,
            expectedSettingsVersion,
            accessType,
            settings,
        },
    }
}

module.exports = {
    validateUpdateRoomSettingsPayload,
    buildEditableSettingsView,
    buildRoomSettingsView,
    hasDisallowedKeys,
    fingerprintUpdateSettings,
    fingerprintRequest,
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
    EDITABLE_ROOM_SETTING_KEYS,
    PRESERVED_ROOM_SETTING_KEYS,
    UPDATE_REQUEST_TOP_LEVEL_KEYS,
    MAX_IDENTIFIER_LENGTH,
    isSettingsIdentifier: isIdentifier,
}
