/**
 * F-20: 대기방 **설정 변경**(update_room_settings) 요청의 canonical 검증·계약 모듈.
 *
 * 방 생성(create_room)과 굳이 분리한 이유는 두 요청이 서로 다른 사실을 말하기 때문이다:
 *   - 생성은 "이런 방을 새로 만들어 달라"이고, 서버 소유 필드가 아예 존재하지 않는다.
 *   - 수정은 "지금 존재하는 **그** 방을, 내가 본 **그** 버전에서 바꿔 달라"이므로
 *     식별자(roomId)·재시도 키(requestId)·기대 버전(expectedSettingsVersion)이 입력의
 *     일부이고, 편집이 허용되지 않는 설정(D-12의 세 규칙)은 입력으로 받지 않는다.
 *
 * 값 자체의 허용 목록은 생성 검증(createRoomValidation)과 역할 구성 검증(roleComposition)을
 * 그대로 재사용한다 — 두 경로가 갈리면 "만들 때는 되는데 바꿀 때는 안 되는" 설정이 생긴다.
 *
 * 계약 요약
 * - 최상위 허용 목록 밖의 키가 하나라도 있으면 거부한다(조용히 버리지 않는다).
 * - lightsOut·soulBetting·voteReveal은 **입력으로 받지 않는다**. 서버가 기존 값을 보존한다.
 * - 관전자 관련 필드(allowSpectators 등)는 허용 목록에 없으므로 자동으로 거부된다(AC-06).
 * - 검증을 통과하면 클라이언트 객체를 저장하지 않고 새 복사본만 돌려준다.
 */

const {
    validateRoleNightActionTimes,
    ROLE_NIGHT_ACTION_TIME_KEYS,
    ALLOWED_MAX_PLAYERS,
    ALLOWED_JOKER_COUNT,
    ALLOWED_DAY_DISCUSSION_TIME,
    ALLOWED_DAY_VOTE_TIME,
    ALLOWED_NIGHT_ACTION_TIME,
} = require('./createRoomValidation')
const {
    CUSTOM_ROLE_KEYS,
    validateCreateRoomRoleComposition,
} = require('../game-core/roleComposition')

const ALLOWED_ACCESS_TYPES = Object.freeze(['open', 'code'])

/** 소켓 이벤트 이름의 단일 원천. frontend/src/domains/game/setup/constants/gameSetupSocket.js와 같은 값이어야 한다. */
const ROOM_SETTINGS_EVENTS = Object.freeze({
    UPDATE_ROOM_SETTINGS: 'update_room_settings',
    GET_ROOM_SETTINGS_UPDATE_RESULT: 'get_room_settings_update_result',
    ROOM_SETTINGS_UPDATED: 'room_settings_updated',
})

/** 실패 사유 코드의 단일 원천(클라이언트 분기용 안정 식별자). */
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

/**
 * F-20에서 방장이 편집할 수 있는 설정 필드. 이 목록이 곧
 *   (1) 수정 요청이 실을 수 있는 설정 입력,
 *   (2) 공개 목록 설정 요약,
 *   (3) F-24의 "다음 방 설정 복원" 입력
 * 세 곳의 공통 원천이다. roleCounts/roleNightActionTimes는 CUSTOM·부분 지정일 때만 존재한다.
 */
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

/**
 * D-12의 추가 규칙 세 가지. F-20 편집 대상이 아니며 수정 요청으로 바뀌지 않는다 —
 * 서버가 기존 값을 그대로 보존한다(A-06). 생성 경로의 검증·기본값 계약은 그대로다.
 */
const PRESERVED_ROOM_SETTING_KEYS = Object.freeze(['lightsOut', 'soulBetting', 'voteReveal'])

/** update_room_settings payload의 최상위 허용 키 전체. 이 밖의 키는 거부 사유다. */
const UPDATE_REQUEST_TOP_LEVEL_KEYS = Object.freeze([
    'roomId',
    'requestId',
    'expectedSettingsVersion',
    'accessType',
    ...EDITABLE_ROOM_SETTING_KEYS,
])

// 식별자 길이 상한. 요청 결과 기록의 키가 되므로 상한이 없으면 한 계정이 임의 길이 문자열로
// 서버 메모리를 늘릴 수 있다. UUID(36자)·nanoid류를 모두 담고도 넉넉한 값이다.
const MAX_IDENTIFIER_LENGTH = 128

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 비어 있지 않고 길이가 제한된 문자열인지. 공백만 있는 값도 식별자가 아니다. */
function isIdentifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH
        && value.trim().length > 0
}

function fail(code, message) {
    return { ok: false, code, message }
}

/**
 * 저장된 room.settings에서 **편집 가능한 필드만** 골라 새 객체로 만든다.
 *
 * 저장 값을 그대로 spread하지 않는 것이 핵심이다 — 예전 데이터에 관전자 키나 알 수 없는
 * 필드가 섞여 있어도 이 경계를 지나면 사라진다(AC-06). 중첩 객체(roleCounts·
 * roleNightActionTimes)도 허용 키만 복사한 새 객체를 만든다.
 *
 * @param {unknown} settings - 신뢰하지 않는(또는 구버전) 저장 설정
 */
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

/**
 * 참가자에게 내려줄 설정 응답. 편집 가능한 필드 + 서버가 보존하는 D-12 세 값이다.
 * 원본 room.settings를 그대로 내보내지 않는 유일한 경계다(AC-06).
 */
function buildRoomSettingsView(settings) {
    const source = isPlainObject(settings) ? settings : {}
    const view = buildEditableSettingsView(source)
    for (const key of PRESERVED_ROOM_SETTING_KEYS) {
        if (source[key] !== undefined) view[key] = source[key]
    }
    return view
}

/**
 * 같은 requestId로 들어온 재시도가 **정말 같은 요청**인지 판정하기 위한 결정적 지문.
 * 키 순서에 흔들리지 않도록 허용 목록 순서로만 직렬화한다.
 */
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

/**
 * **요청 전체**의 정규화 지문. 같은 requestId로 들어온 재시도가 정말 같은 요청인지 판정한다.
 *
 * expectedSettingsVersion을 포함하는 이유: 그 값은 "내가 어느 버전을 보고 눌렀는가"라는
 * 승인된 요청의 일부이지 전송 부수 정보가 아니다. 설정 값만으로 지문을 만들면
 *   v1 저장 성공 → 같은 requestId·같은 설정·expectedSettingsVersion=2 재전달
 * 이 "같은 요청의 멱등 재시도"로 통과해, 서버가 v1 결과를 v2 요청의 답으로 돌려준다.
 * 진짜 재시도(같은 버전·같은 값)는 지문이 그대로라 여전히 멱등이다.
 *
 * fingerprintUpdateSettings와 분리해 둔 이유: 그쪽은 "지금 저장된 설정과 달라지는가"
 * (changed 판정)를 묻는 서로 다른 질문이고, 그 비교에는 버전이 들어가면 안 된다.
 */
function fingerprintUpdateRequest(expectedSettingsVersion, accessType, settings) {
    return `v=${expectedSettingsVersion}|${fingerprintUpdateSettings(accessType, settings)}`
}

/**
 * update_room_settings payload를 검증합니다. 보정 없이 거부만 합니다.
 *
 * @param {unknown} payload - 클라이언트가 보낸 값(신뢰하지 않음)
 * @returns {{ok:true,value:{roomId:string,requestId:string,expectedSettingsVersion:number,
 *            accessType:string,settings:object}}|{ok:false,code:string,message:string}}
 * @flow 형태 → 최상위 허용 목록 → 식별자/버전 → 값 허용 목록 → 역할 구성 순으로 검사한다.
 */
function validateUpdateRoomSettingsPayload(payload) {
    if (!isPlainObject(payload)) {
        return fail(ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
    }

    // 허용 목록 밖의 최상위 키는 조용히 무시하지 않고 거부한다 — 무시하면 클라이언트는
    // "관전자 설정을 보냈다"고 믿는데 서버는 다르게 해석하는 상태가 된다(AC-06).
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
    // 버전은 서버가 1부터 발급하므로 양의 안전한 정수만 의미가 있다. 0/음수/실수/문자열은
    // "내가 본 버전"을 표현하지 못하므로 그 자체로 잘못된 요청이다.
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

    // 생성 경로와 **같은** 순서로 역할 구성을 검증한다(F0991 → F0386). 그래야 광대 상한
    // 2명 같은 역할 계약이 수정 경로에서도 똑같이 집행된다.
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
    // 지정이 없으면 키 자체를 만들지 않는다(생성 검증과 같은 이유) — 빈 객체를 저장하면
    // "전 직업 폴백"과 "지정했지만 비어 있음"이 구별되지 않는다.
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
    fingerprintUpdateSettings,
    fingerprintUpdateRequest,
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
    EDITABLE_ROOM_SETTING_KEYS,
    PRESERVED_ROOM_SETTING_KEYS,
    UPDATE_REQUEST_TOP_LEVEL_KEYS,
    MAX_IDENTIFIER_LENGTH,
}
