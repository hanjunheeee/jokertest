/**
 * 역할 구성(role composition)의 canonical 정의·검증·해석을 한 곳에 모은 모듈입니다.
 *
 * 이 파일이 존재하는 이유: "AUTO(기존 jokerCount 기반 자동 구성)"와 "CUSTOM(방장이 고정
 * 역할 수를 직접 지정)" 두 모드가 생기면서, 같은 판정을 방 생성(socket) · 시작 재검증
 * (socket) · 세션 조립/커밋(game-core) 세 곳에서 하게 됐다. 각 호출부가 제각각 fallback을
 * 두면 "모드가 없으면 AUTO" 같은 규칙이 조용히 어긋날 수 있어, 좁은 범위의 helper 하나로
 * 모아 단일 원천으로 삼는다.
 *
 * 계약 요약
 * - roleCompositionMode가 없는(구버전) settings는 AUTO로 해석한다.
 * - AUTO는 기존 jokerCount 동작을 그대로 유지한다(computeRoleComposition).
 * - CUSTOM에서는 roleCounts.JOKER가 JOKER 수의 canonical 값이며, settings.jokerCount는
 *   기존 소비자(computeCanStart·handleStartGame·validateSessionInput)를 위해 남기되
 *   roleCounts.JOKER와 절대 어긋날 수 없다.
 * - CITIZEN은 클라이언트가 지정할 수 없고, 게임 시작 시점의 실제 인원에서 파생된다.
 */

const ROLE_COMPOSITION_MODES = Object.freeze({ AUTO: 'auto', CUSTOM: 'custom' })

// 클라이언트가 직접 개수를 지정할 수 있는 역할. CITIZEN은 의도적으로 빠져 있다 —
// 시작 시점의 실제 인원에서 파생되는 값이라 입력으로 받으면 두 원천이 생긴다.
const CUSTOM_ROLE_KEYS = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

// 해석된 canonical 구성이 항상 가져야 하는 5개 키(CUSTOM_ROLE_KEYS + CITIZEN).
const RESOLVED_COMPOSITION_KEYS = Object.freeze([...CUSTOM_ROLE_KEYS, 'CITIZEN'])

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0
}

// 인원수 구간별 특수 시민 역할 상한("budget"). 도입 우선순위(DOCTOR → GUARD →
// WITCH_HUNTER, 사용자 확정)와 함께 computeRoleComposition이 남은 슬롯에서 이 상한만큼만
// 채운다. 2~10명 도메인에서만 정의된다(gameSession.js의 MIN/MAX_SUPPORTED_PLAYERS 참고).
function getSpecialRoleBudget(playerCount) {
    if (playerCount >= 10) return { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }
    if (playerCount >= 8) return { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 }
    if (playerCount >= 6) return { DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 }
    return { DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } // 2~5명
}

// 순수 계산 — 슬롯 절삭(slot-cutting) 방식이라 항상 성공한다: 먼저 jokerCount만큼 JOKER를
// 배정하고, 남은 non-JOKER 슬롯에서 DOCTOR → GUARD → WITCH_HUNTER 순으로 "budget과 남은
// 슬롯 중 작은 값"만큼만 채운 뒤, 최종 남은 슬롯은 전부 CITIZEN이 된다. 슬롯이 모자라면
// 우선순위 뒤쪽 역할부터 0명이 될 뿐 거부/예외는 없다 — 입력 자체의 불변조건
// (jokerCount < playerCount, 정수, 0 이상, 2~10명)은 validateSessionInput이 이미
// 보장하므로 이 함수는 그 보장 위에서 계산만 한다. 어떤 유효 입력에서도 각 역할 수는
// 0 이상이고 합계는 정확히 playerCount다. AUTO 모드의 유일한 구성 원천이다.
function computeRoleComposition(playerCount, jokerCount) {
    const budget = getSpecialRoleBudget(playerCount)
    let remaining = playerCount - jokerCount

    const doctorCount = Math.min(budget.DOCTOR, remaining)
    remaining -= doctorCount
    const guardCount = Math.min(budget.GUARD, remaining)
    remaining -= guardCount
    const witchHunterCount = Math.min(budget.WITCH_HUNTER, remaining)
    remaining -= witchHunterCount

    return {
        JOKER: jokerCount,
        DOCTOR: doctorCount,
        GUARD: guardCount,
        WITCH_HUNTER: witchHunterCount,
        CITIZEN: remaining, // 남은 슬롯 전부
    }
}

/**
 * settings/payload의 roleCompositionMode를 canonical 모드로 해석합니다.
 * 값이 아예 없으면(구버전 방·구버전 클라이언트) AUTO로 본다 — 이 fallback을 이 함수
 * 하나에만 두는 것이 이 모듈의 존재 이유다.
 * @returns {'auto'|'custom'|null} null이면 "알 수 없는 값"(호출부가 거부해야 함)
 */
function resolveRoleCompositionMode(source) {
    const mode = isPlainObject(source) ? source.roleCompositionMode : undefined
    if (mode === undefined || mode === null) return ROLE_COMPOSITION_MODES.AUTO
    if (mode === ROLE_COMPOSITION_MODES.AUTO) return ROLE_COMPOSITION_MODES.AUTO
    if (mode === ROLE_COMPOSITION_MODES.CUSTOM) return ROLE_COMPOSITION_MODES.CUSTOM
    return null
}

/**
 * CUSTOM roleCounts 자체의 canonical 검증 + 방어적 복사본 생성.
 * 보정(clamp)·문자열 파싱을 하지 않고 거부만 한다.
 * @param {unknown} roleCounts - 신뢰하지 않는 입력
 * @param {number} slotCount - 비교 기준 인원(생성 시엔 maxPlayers, 시작 시엔 실제 참가자 수)
 * @returns {{ok:true,roleCounts:object}|{ok:false,reason:string}}
 */
function validateCustomRoleCounts(roleCounts, slotCount) {
    if (!isPlainObject(roleCounts)) {
        return { ok: false, reason: 'ROLE_COUNTS_NOT_OBJECT' }
    }
    // 허용된 4개 키 외의 키(오타·CITIZEN·서버 소유 필드 등)는 조용히 무시하지 않고 거부한다.
    // 무시하면 클라이언트는 "CITIZEN을 지정했다"고 믿는데 서버는 다르게 해석하는 상태가 된다.
    for (const key of Object.keys(roleCounts)) {
        if (!CUSTOM_ROLE_KEYS.includes(key)) {
            return { ok: false, reason: 'UNKNOWN_ROLE_KEY' }
        }
    }
    for (const key of CUSTOM_ROLE_KEYS) {
        if (!isNonNegativeInteger(roleCounts[key])) {
            return { ok: false, reason: 'INVALID_ROLE_COUNT' }
        }
    }
    if (roleCounts.JOKER < 1) {
        return { ok: false, reason: 'JOKER_COUNT_TOO_LOW' }
    }
    if (!Number.isInteger(slotCount) || slotCount < 1) {
        return { ok: false, reason: 'INVALID_SLOT_COUNT' }
    }
    // 전원이 JOKER인 구성을 막는다(비-광대가 최소 1명은 있어야 게임이 성립한다).
    if (roleCounts.JOKER >= slotCount) {
        return { ok: false, reason: 'JOKER_COUNT_TOO_HIGH' }
    }
    const fixedRoleCount = CUSTOM_ROLE_KEYS.reduce((sum, key) => sum + roleCounts[key], 0)
    if (fixedRoleCount > slotCount) {
        return { ok: false, reason: 'FIXED_ROLES_EXCEED_SLOTS' }
    }
    // 방어적 canonical 복사본 — 호출부가 원본 객체(클라이언트 payload 등)를 그대로
    // 저장하지 않도록 키 순서까지 고정된 새 객체를 만들어 돌려준다.
    const canonical = {}
    for (const key of CUSTOM_ROLE_KEYS) canonical[key] = roleCounts[key]
    return { ok: true, roleCounts: canonical }
}

/** validateCustomRoleCounts의 reason을 방 생성 실패 메시지로 정규화합니다(기존 create_room 스타일). */
const CREATE_ROOM_ROLE_COMPOSITION_MESSAGES = Object.freeze({
    INVALID_MODE: '역할 구성 방식 값이 올바르지 않습니다.',
    ROLE_COUNTS_NOT_OBJECT: '역할 구성 값이 올바르지 않습니다.',
    UNKNOWN_ROLE_KEY: '역할 구성 값이 올바르지 않습니다.',
    INVALID_ROLE_COUNT: '역할별 인원 수가 올바르지 않습니다.',
    JOKER_COUNT_TOO_LOW: '광대는 최소 1명이어야 합니다.',
    JOKER_COUNT_TOO_HIGH: '광대 수는 최대 플레이어 수보다 적어야 합니다.',
    INVALID_SLOT_COUNT: '최대 플레이어 수가 올바르지 않습니다.',
    FIXED_ROLES_EXCEED_SLOTS: '지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.',
    ROLE_COUNTS_NOT_ALLOWED: '자동 구성에서는 역할별 인원을 지정할 수 없습니다.',
    JOKER_COUNT_MISMATCH: '광대 수 설정이 서로 어긋났습니다.',
})

/**
 * create_room payload의 역할 구성 부분을 검증해 settings에 병합할 canonical 조각을 만듭니다.
 * maxPlayers/jokerCount는 이미 기본 검증(validateCreateRoomPayload)을 통과한 값을 받습니다.
 *
 * CUSTOM에서 payload.jokerCount와 roleCounts.JOKER가 다르면 거부한다 — 둘 중 하나만 보는
 * 소비자가 있는 한(computeCanStart 등) 값이 갈리는 순간 서로 다른 게임을 보게 된다.
 *
 * @param {unknown} payload - 클라이언트 원본 payload(신뢰하지 않음)
 * @param {{maxPlayers:number, jokerCount:number}} baseSettings - 검증을 마친 기본 설정
 * @returns {{ok:true,value:object}|{ok:false,message:string}}
 */
function validateCreateRoomRoleComposition(payload, baseSettings) {
    const mode = resolveRoleCompositionMode(payload)
    if (mode === null) {
        return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.INVALID_MODE }
    }
    const rawRoleCounts = isPlainObject(payload) ? payload.roleCounts : undefined

    if (mode === ROLE_COMPOSITION_MODES.AUTO) {
        // AUTO에서 roleCounts를 함께 보내는 것은 계약 위반이다. 조용히 버리면 클라이언트는
        // 지정이 반영됐다고 믿게 되므로 명시적으로 거부한다.
        if (rawRoleCounts !== undefined) {
            return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.ROLE_COUNTS_NOT_ALLOWED }
        }
        return { ok: true, value: { roleCompositionMode: ROLE_COMPOSITION_MODES.AUTO } }
    }

    const validated = validateCustomRoleCounts(rawRoleCounts, baseSettings.maxPlayers)
    if (!validated.ok) {
        return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES[validated.reason] }
    }
    if (validated.roleCounts.JOKER !== baseSettings.jokerCount) {
        return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.JOKER_COUNT_MISMATCH }
    }
    return {
        ok: true,
        value: {
            roleCompositionMode: ROLE_COMPOSITION_MODES.CUSTOM,
            roleCounts: validated.roleCounts,
        },
    }
}

/**
 * 저장된 room.settings와 "실제 참가자 수"로부터 canonical 5역할 구성을 해석합니다.
 * 방 생성 시점 검증은 maxPlayers 기준이므로, 시작 시점에는 실제 인원 기준으로 반드시
 * 다시 해석·검증해야 한다(정원보다 적은 인원으로 시작할 수 있기 때문).
 *
 * 저장된 값을 신뢰하지 않고 매번 재검증한다(gameSession.js의 기존 스타일과 동일).
 * @returns {{ok:true,composition:object}|{ok:false,reason:string}}
 */
function resolveRoleComposition(settings, playerCount) {
    if (!Number.isInteger(playerCount) || playerCount < 1) {
        return { ok: false, reason: 'INVALID_PLAYER_COUNT' }
    }
    const mode = resolveRoleCompositionMode(settings)
    if (mode === null) return { ok: false, reason: 'INVALID_MODE' }

    const storedJokerCount = isPlainObject(settings) ? settings.jokerCount ?? 0 : 0

    if (mode === ROLE_COMPOSITION_MODES.AUTO) {
        if (!isNonNegativeInteger(storedJokerCount)) {
            return { ok: false, reason: 'INVALID_JOKER_COUNT' }
        }
        if (storedJokerCount >= playerCount) {
            return { ok: false, reason: 'JOKER_COUNT_TOO_HIGH' }
        }
        return { ok: true, composition: computeRoleComposition(playerCount, storedJokerCount) }
    }

    const validated = validateCustomRoleCounts(settings.roleCounts, playerCount)
    if (!validated.ok) {
        // slotCount가 실제 인원이므로 FIXED_ROLES_EXCEED_SLOTS/JOKER_COUNT_TOO_HIGH가
        // 여기서 "현재 인원으로는 시작할 수 없다"는 뜻이 된다.
        return { ok: false, reason: validated.reason }
    }
    if (validated.roleCounts.JOKER !== storedJokerCount) {
        return { ok: false, reason: 'JOKER_COUNT_MISMATCH' }
    }
    const fixedRoleCount = CUSTOM_ROLE_KEYS.reduce((sum, key) => sum + validated.roleCounts[key], 0)
    return {
        ok: true,
        // CITIZEN은 여기서만 만들어진다 — 실제 인원에서 고정 역할 합을 뺀 나머지.
        composition: { ...validated.roleCounts, CITIZEN: playerCount - fixedRoleCount },
    }
}

/**
 * 이미 해석된 composition이 여전히 canonical한지 검사합니다(commit 경계용).
 * "저장된 값을 신뢰하지 않는다"는 원칙에 따라, 세션에 보관된 구성도 커밋 직전에 인원수·
 * jokerCount와 다시 대조한다.
 * @returns {{ok:true}|{ok:false,reason:string}}
 */
function validateResolvedComposition(composition, playerCount, jokerCount) {
    if (!isPlainObject(composition)) return { ok: false, reason: 'NOT_OBJECT' }
    const keys = Object.keys(composition)
    if (keys.length !== RESOLVED_COMPOSITION_KEYS.length) return { ok: false, reason: 'UNEXPECTED_KEYS' }
    for (const key of RESOLVED_COMPOSITION_KEYS) {
        if (!isNonNegativeInteger(composition[key])) return { ok: false, reason: 'INVALID_ROLE_COUNT' }
    }
    const total = RESOLVED_COMPOSITION_KEYS.reduce((sum, key) => sum + composition[key], 0)
    if (total !== playerCount) return { ok: false, reason: 'TOTAL_MISMATCH' }
    // session.jokerCount와 구성의 JOKER 수가 갈리면 어느 쪽이 진실인지 알 수 없게 된다.
    if (composition.JOKER !== jokerCount) return { ok: false, reason: 'JOKER_COUNT_MISMATCH' }
    return { ok: true }
}

module.exports = {
    ROLE_COMPOSITION_MODES,
    CUSTOM_ROLE_KEYS,
    RESOLVED_COMPOSITION_KEYS,
    getSpecialRoleBudget,
    computeRoleComposition,
    resolveRoleCompositionMode,
    validateCustomRoleCounts,
    validateCreateRoomRoleComposition,
    resolveRoleComposition,
    validateResolvedComposition,
}
