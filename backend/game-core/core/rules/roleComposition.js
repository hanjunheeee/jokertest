// 역할 구성 정하는 파일 (판 쪼개기 전부터 따로 있던 파일)
// 방 만들기·방 설정 검사·판 준비(setup)가 사용

// 구성 방식: 자동(인원 따라 정함) / 직접(방장이 역할별 수 지정)
const ROLE_COMPOSITION_MODES = Object.freeze({ AUTO: 'auto', CUSTOM: 'custom' })

// 직접 지정할 수 있는 역할 (시민은 남는 자리로 채움)
const CUSTOM_ROLE_KEYS = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

// 최종 구성에 꼭 있어야 하는 역할 칸 (시민 포함)
const RESOLVED_COMPOSITION_KEYS = Object.freeze([...CUSTOM_ROLE_KEYS, 'CITIZEN'])

// 역할 하나당 최대 2명
const MAX_SPECIAL_ROLE_COUNT = 2

// 배열 아닌 진짜 객체인지
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 0 이상 정수인지
function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0
}

// 자동 구성 때 인원별 특수 역할 수
// 6명부터 의사, 8명부터 경비원, 10명부터 마녀사냥꾼
function getSpecialRoleBudget(playerCount) {
    if (playerCount >= 10) return { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }
    if (playerCount >= 8) return { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 }
    if (playerCount >= 6) return { DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 }
    return { DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
}

// 자동 구성 계산: 광대 빼고 남은 자리에 특수 역할 채움
function computeRoleComposition(playerCount, jokerCount) {
    // 의사→경비원→마녀사냥꾼 순, 자리 모자라면 뒤 역할이 줄어듦
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
        CITIZEN: remaining,
    }
}

// 구성 방식 읽기 (안 적었으면 자동, 모르는 값이면 null)
function resolveRoleCompositionMode(source) {
    const mode = isPlainObject(source) ? source.roleCompositionMode : undefined
    if (mode === undefined || mode === null) return ROLE_COMPOSITION_MODES.AUTO
    if (mode === ROLE_COMPOSITION_MODES.AUTO) return ROLE_COMPOSITION_MODES.AUTO
    if (mode === ROLE_COMPOSITION_MODES.CUSTOM) return ROLE_COMPOSITION_MODES.CUSTOM
    return null
}

// 직접 지정한 역할별 수 검사, 통과하면 깨끗한 복사본 돌려줌
function validateCustomRoleCounts(roleCounts, slotCount) {
    // 객체 아니거나 모르는 역할 이름 끼우면 거절
    if (!isPlainObject(roleCounts)) {
        return { ok: false, reason: 'ROLE_COUNTS_NOT_OBJECT' }
    }
    for (const key of Object.keys(roleCounts)) {
        if (!CUSTOM_ROLE_KEYS.includes(key)) {
            return { ok: false, reason: 'UNKNOWN_ROLE_KEY' }
        }
    }
    // 네 역할 전부 0 이상 정수로 와야 함
    for (const key of CUSTOM_ROLE_KEYS) {
        if (!isNonNegativeInteger(roleCounts[key])) {
            return { ok: false, reason: 'INVALID_ROLE_COUNT' }
        }
    }
    // 광대는 1명 이상, 자리 수보다 적게
    if (roleCounts.JOKER < 1) {
        return { ok: false, reason: 'JOKER_COUNT_TOO_LOW' }
    }
    if (!Number.isInteger(slotCount) || slotCount < 1) {
        return { ok: false, reason: 'INVALID_SLOT_COUNT' }
    }
    if (roleCounts.JOKER >= slotCount) {
        return { ok: false, reason: 'JOKER_COUNT_TOO_HIGH' }
    }
    // 역할마다 최대 2명
    for (const key of CUSTOM_ROLE_KEYS) {
        if (roleCounts[key] > MAX_SPECIAL_ROLE_COUNT) {
            return { ok: false, reason: 'ROLE_COUNT_ABOVE_LIMIT' }
        }
    }
    // 지정한 역할 합이 자리 수를 넘으면 거절 (시민은 0명이어도 됨)
    const fixedRoleCount = CUSTOM_ROLE_KEYS.reduce((sum, key) => sum + roleCounts[key], 0)
    if (fixedRoleCount > slotCount) {
        return { ok: false, reason: 'FIXED_ROLES_EXCEED_SLOTS' }
    }
    // 정해진 네 칸만 옮겨 담음 (딴 값 끼어드는 것 막기)
    const canonical = {}
    for (const key of CUSTOM_ROLE_KEYS) canonical[key] = roleCounts[key]
    return { ok: true, roleCounts: canonical }
}

// 검사 실패 이유 → 방장 화면에 보여 줄 문구
const CREATE_ROOM_ROLE_COMPOSITION_MESSAGES = Object.freeze({
    INVALID_MODE: '역할 구성 방식 값이 올바르지 않습니다.',
    ROLE_COUNTS_NOT_OBJECT: '역할 구성 값이 올바르지 않습니다.',
    UNKNOWN_ROLE_KEY: '역할 구성 값이 올바르지 않습니다.',
    INVALID_ROLE_COUNT: '역할별 인원 수가 올바르지 않습니다.',
    JOKER_COUNT_TOO_LOW: '광대는 최소 1명이어야 합니다.',
    JOKER_COUNT_TOO_HIGH: '광대 수는 최대 플레이어 수보다 적어야 합니다.',
    INVALID_SLOT_COUNT: '최대 플레이어 수가 올바르지 않습니다.',
    FIXED_ROLES_EXCEED_SLOTS: '지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.',
    ROLE_COUNT_ABOVE_LIMIT: `역할별 인원은 최대 ${MAX_SPECIAL_ROLE_COUNT}명까지 지정할 수 있습니다.`,
    ROLE_COUNTS_NOT_ALLOWED: '자동 구성에서는 역할별 인원을 지정할 수 없습니다.',
    JOKER_COUNT_MISMATCH: '광대 수 설정이 서로 어긋났습니다.',
})

// 방 만들기·방 설정 바꾸기 때 역할 구성 검사 (지도 09-①)
function validateCreateRoomRoleComposition(payload, baseSettings) {
    // 모르는 구성 방식이면 거절
    const mode = resolveRoleCompositionMode(payload)
    if (mode === null) {
        return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.INVALID_MODE }
    }
    const rawRoleCounts = isPlainObject(payload) ? payload.roleCounts : undefined

    // 자동: 역할별 수를 보내면 거절, 광대 수만 2명 이하인지
    if (mode === ROLE_COMPOSITION_MODES.AUTO) {
        if (rawRoleCounts !== undefined) {
            return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.ROLE_COUNTS_NOT_ALLOWED }
        }
        if (baseSettings.jokerCount > MAX_SPECIAL_ROLE_COUNT) {
            return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.ROLE_COUNT_ABOVE_LIMIT }
        }
        return { ok: true, value: { roleCompositionMode: ROLE_COMPOSITION_MODES.AUTO } }
    }

    // 직접: 역할별 수 검사 + 광대 수가 따로 받은 광대 설정이랑 같은지
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

// 방 설정 + 실제 인원으로 최종 구성 정하기
// 시작 가능한지 확인·판 준비 때 사용
function resolveRoleComposition(settings, playerCount) {
    // 인원 수·구성 방식이 이상하면 거절
    if (!Number.isInteger(playerCount) || playerCount < 1) {
        return { ok: false, reason: 'INVALID_PLAYER_COUNT' }
    }
    const mode = resolveRoleCompositionMode(settings)
    if (mode === null) return { ok: false, reason: 'INVALID_MODE' }

    // 방에 저장된 광대 수 (없으면 0)
    const storedJokerCount = isPlainObject(settings) ? settings.jokerCount ?? 0 : 0

    // 자동: 광대 수가 인원보다 적고 2명 이하일 때 인원 따라 계산
    if (mode === ROLE_COMPOSITION_MODES.AUTO) {
        if (!isNonNegativeInteger(storedJokerCount)) {
            return { ok: false, reason: 'INVALID_JOKER_COUNT' }
        }
        if (storedJokerCount >= playerCount) {
            return { ok: false, reason: 'JOKER_COUNT_TOO_HIGH' }
        }
        if (storedJokerCount > MAX_SPECIAL_ROLE_COUNT) {
            return { ok: false, reason: 'ROLE_COUNT_ABOVE_LIMIT' }
        }
        return { ok: true, composition: computeRoleComposition(playerCount, storedJokerCount) }
    }

    // 직접: 실제 인원 기준으로 다시 검사 (자리 수 = 지금 인원)
    const validated = validateCustomRoleCounts(settings.roleCounts, playerCount)
    if (!validated.ok) {
        return { ok: false, reason: validated.reason }
    }
    if (validated.roleCounts.JOKER !== storedJokerCount) {
        return { ok: false, reason: 'JOKER_COUNT_MISMATCH' }
    }
    // 남는 자리는 전부 시민
    const fixedRoleCount = CUSTOM_ROLE_KEYS.reduce((sum, key) => sum + validated.roleCounts[key], 0)
    return {
        ok: true,
        composition: { ...validated.roleCounts, CITIZEN: playerCount - fixedRoleCount },
    }
}

// 판 등록 직전 마지막 확인: 다섯 칸 정확히, 합 = 인원, 광대 수 일치
function validateResolvedComposition(composition, playerCount, jokerCount) {
    if (!isPlainObject(composition)) return { ok: false, reason: 'NOT_OBJECT' }
    const keys = Object.keys(composition)
    if (keys.length !== RESOLVED_COMPOSITION_KEYS.length) return { ok: false, reason: 'UNEXPECTED_KEYS' }
    for (const key of RESOLVED_COMPOSITION_KEYS) {
        if (!isNonNegativeInteger(composition[key])) return { ok: false, reason: 'INVALID_ROLE_COUNT' }
    }
    const total = RESOLVED_COMPOSITION_KEYS.reduce((sum, key) => sum + composition[key], 0)
    if (total !== playerCount) return { ok: false, reason: 'TOTAL_MISMATCH' }
    if (composition.JOKER !== jokerCount) return { ok: false, reason: 'JOKER_COUNT_MISMATCH' }
    return { ok: true }
}

// 밖으로 내보내는 것 (상수 + 검사·계산 함수)
module.exports = {
    ROLE_COMPOSITION_MODES,
    CUSTOM_ROLE_KEYS,
    RESOLVED_COMPOSITION_KEYS,
    MAX_SPECIAL_ROLE_COUNT,
    getSpecialRoleBudget,
    computeRoleComposition,
    resolveRoleCompositionMode,
    validateCustomRoleCounts,
    validateCreateRoomRoleComposition,
    resolveRoleComposition,
    validateResolvedComposition,
}
