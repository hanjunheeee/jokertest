const ROLE_COMPOSITION_MODES = Object.freeze({ AUTO: 'auto', CUSTOM: 'custom' })

const CUSTOM_ROLE_KEYS = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

const RESOLVED_COMPOSITION_KEYS = Object.freeze([...CUSTOM_ROLE_KEYS, 'CITIZEN'])

const MAX_SPECIAL_ROLE_COUNT = 2

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0
}

function getSpecialRoleBudget(playerCount) {
    if (playerCount >= 10) return { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }
    if (playerCount >= 8) return { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 }
    if (playerCount >= 6) return { DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 }
    return { DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
}

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
        CITIZEN: remaining,
    }
}

function resolveRoleCompositionMode(source) {
    const mode = isPlainObject(source) ? source.roleCompositionMode : undefined
    if (mode === undefined || mode === null) return ROLE_COMPOSITION_MODES.AUTO
    if (mode === ROLE_COMPOSITION_MODES.AUTO) return ROLE_COMPOSITION_MODES.AUTO
    if (mode === ROLE_COMPOSITION_MODES.CUSTOM) return ROLE_COMPOSITION_MODES.CUSTOM
    return null
}

function validateCustomRoleCounts(roleCounts, slotCount) {
    if (!isPlainObject(roleCounts)) {
        return { ok: false, reason: 'ROLE_COUNTS_NOT_OBJECT' }
    }
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
    if (roleCounts.JOKER >= slotCount) {
        return { ok: false, reason: 'JOKER_COUNT_TOO_HIGH' }
    }
    for (const key of CUSTOM_ROLE_KEYS) {
        if (roleCounts[key] > MAX_SPECIAL_ROLE_COUNT) {
            return { ok: false, reason: 'ROLE_COUNT_ABOVE_LIMIT' }
        }
    }
    const fixedRoleCount = CUSTOM_ROLE_KEYS.reduce((sum, key) => sum + roleCounts[key], 0)
    if (fixedRoleCount > slotCount) {
        return { ok: false, reason: 'FIXED_ROLES_EXCEED_SLOTS' }
    }
    const canonical = {}
    for (const key of CUSTOM_ROLE_KEYS) canonical[key] = roleCounts[key]
    return { ok: true, roleCounts: canonical }
}

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

function validateCreateRoomRoleComposition(payload, baseSettings) {
    const mode = resolveRoleCompositionMode(payload)
    if (mode === null) {
        return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.INVALID_MODE }
    }
    const rawRoleCounts = isPlainObject(payload) ? payload.roleCounts : undefined

    if (mode === ROLE_COMPOSITION_MODES.AUTO) {
        if (rawRoleCounts !== undefined) {
            return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.ROLE_COUNTS_NOT_ALLOWED }
        }
        if (baseSettings.jokerCount > MAX_SPECIAL_ROLE_COUNT) {
            return { ok: false, message: CREATE_ROOM_ROLE_COMPOSITION_MESSAGES.ROLE_COUNT_ABOVE_LIMIT }
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
        if (storedJokerCount > MAX_SPECIAL_ROLE_COUNT) {
            return { ok: false, reason: 'ROLE_COUNT_ABOVE_LIMIT' }
        }
        return { ok: true, composition: computeRoleComposition(playerCount, storedJokerCount) }
    }

    const validated = validateCustomRoleCounts(settings.roleCounts, playerCount)
    if (!validated.ok) {
        return { ok: false, reason: validated.reason }
    }
    if (validated.roleCounts.JOKER !== storedJokerCount) {
        return { ok: false, reason: 'JOKER_COUNT_MISMATCH' }
    }
    const fixedRoleCount = CUSTOM_ROLE_KEYS.reduce((sum, key) => sum + validated.roleCounts[key], 0)
    return {
        ok: true,
        composition: { ...validated.roleCounts, CITIZEN: playerCount - fixedRoleCount },
    }
}

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
