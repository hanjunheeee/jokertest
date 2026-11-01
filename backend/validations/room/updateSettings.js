const {
    validateRoleNightActionTimes,
    ROLE_NIGHT_ACTION_TIME_KEYS,
    ALLOWED_MAX_PLAYERS,
    ALLOWED_JOKER_COUNT,
    ALLOWED_DAY_DISCUSSION_TIME,
    ALLOWED_DAY_VOTE_TIME,
    ALLOWED_NIGHT_ACTION_TIME,
} = require('./create')
const {
    CUSTOM_ROLE_KEYS,
    validateCreateRoomRoleComposition,
} = require('../../game-core/roleComposition')

const ALLOWED_ACCESS_TYPES = Object.freeze(['open', 'code'])

const ROOM_SETTINGS_EVENTS = Object.freeze({
    UPDATE_ROOM_SETTINGS: 'update_room_settings',
    GET_ROOM_SETTINGS_UPDATE_RESULT: 'get_room_settings_update_result',
    ROOM_SETTINGS_UPDATED: 'room_settings_updated',
})

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

const PRESERVED_ROOM_SETTING_KEYS = Object.freeze(['lightsOut', 'soulBetting', 'voteReveal'])

const UPDATE_REQUEST_TOP_LEVEL_KEYS = Object.freeze([
    'roomId',
    'requestId',
    'expectedSettingsVersion',
    'accessType',
    ...EDITABLE_ROOM_SETTING_KEYS,
])

const MAX_IDENTIFIER_LENGTH = 128

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIdentifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH
        && value.trim().length > 0
}

function fail(code, message) {
    return { ok: false, code, message }
}

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

function buildRoomSettingsView(settings) {
    const source = isPlainObject(settings) ? settings : {}
    const view = buildEditableSettingsView(source)
    for (const key of PRESERVED_ROOM_SETTING_KEYS) {
        if (source[key] !== undefined) view[key] = source[key]
    }
    return view
}

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

function fingerprintUpdateSettings(accessType, settings) {
    const parts = [`accessType=${accessType}`]
    for (const key of EDITABLE_ROOM_SETTING_KEYS) {
        const value = settings?.[key]
        if (value === undefined) {
            parts.push(`${key}=`)
            continue
        }
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

function fingerprintRequest(expectedSettingsVersion, accessType, settings) {
    return `v=${expectedSettingsVersion}|${fingerprintUpdateSettings(accessType, settings)}`
}

function validateUpdateRoomSettingsPayload(payload) {
    if (!isPlainObject(payload)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
    }

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

    if (!isIdentifier(roomId)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '방 식별자가 올바르지 않습니다.')
    }
    if (!isIdentifier(requestId)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '요청 식별자가 올바르지 않습니다.')
    }
    if (!Number.isSafeInteger(expectedSettingsVersion) || expectedSettingsVersion < 1) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '설정 버전 값이 올바르지 않습니다.')
    }

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

    const roleComposition = validateCreateRoomRoleComposition(payload, { maxPlayers, jokerCount })
    if (!roleComposition.ok) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, roleComposition.message)
    }

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
