const test = require('node:test')
const assert = require('node:assert/strict')

const {
    ROLE_COMPOSITION_MODES,
    MAX_SPECIAL_ROLE_COUNT,
    computeRoleComposition,
    resolveRoleCompositionMode,
    validateCustomRoleCounts,
    validateCreateRoomRoleComposition,
    resolveRoleComposition,
    validateResolvedComposition,
} = require('../roleComposition')

function customCounts(overrides = {}) {
    return { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, ...overrides }
}

function baseSettings(overrides = {}) {
    return { maxPlayers: 8, jokerCount: 2, ...overrides }
}

// ── 모드 해석 ───────────────────────────────────────────────────────────────

test('resolveRoleCompositionMode: 모드가 없는 구버전 settings는 AUTO로 해석된다', () => {
    assert.equal(resolveRoleCompositionMode(undefined), ROLE_COMPOSITION_MODES.AUTO)
    assert.equal(resolveRoleCompositionMode(null), ROLE_COMPOSITION_MODES.AUTO)
    assert.equal(resolveRoleCompositionMode({}), ROLE_COMPOSITION_MODES.AUTO)
    assert.equal(resolveRoleCompositionMode({ maxPlayers: 8, jokerCount: 2 }), ROLE_COMPOSITION_MODES.AUTO)
    assert.equal(resolveRoleCompositionMode({ roleCompositionMode: 'auto' }), ROLE_COMPOSITION_MODES.AUTO)
    assert.equal(resolveRoleCompositionMode({ roleCompositionMode: 'custom' }), ROLE_COMPOSITION_MODES.CUSTOM)
})

test('resolveRoleCompositionMode: 알 수 없는 모드 값은 null(거부 대상)이다', () => {
    for (const invalid of ['AUTO', 'Custom', '', 0, 1, true, {}, []]) {
        assert.equal(resolveRoleCompositionMode({ roleCompositionMode: invalid }), null, `${String(invalid)}는 거부돼야 함`)
    }
})

// ── roleCounts 자체 검증 ────────────────────────────────────────────────────

test('validateCustomRoleCounts: 유효한 구성은 방어적 canonical 복사본을 돌려준다', () => {
    const source = customCounts()
    const result = validateCustomRoleCounts(source, 8)

    assert.equal(result.ok, true)
    assert.deepEqual(result.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
    assert.notEqual(result.roleCounts, source) // 원본 참조를 그대로 쓰지 않는다
    source.JOKER = 99
    assert.equal(result.roleCounts.JOKER, 2) // 원본을 나중에 바꿔도 복사본은 그대로
})

test('validateCustomRoleCounts: 객체가 아니거나 배열이면 거부한다', () => {
    for (const invalid of [undefined, null, [], 'x', 3, true]) {
        assert.equal(validateCustomRoleCounts(invalid, 8).reason, 'ROLE_COUNTS_NOT_OBJECT', `${String(invalid)}는 거부돼야 함`)
    }
})

test('validateCustomRoleCounts: CITIZEN·알 수 없는 키는 거부한다', () => {
    assert.equal(validateCustomRoleCounts(customCounts({ CITIZEN: 3 }), 8).reason, 'UNKNOWN_ROLE_KEY')
    assert.equal(validateCustomRoleCounts(customCounts({ hostUuid: 'x' }), 8).reason, 'UNKNOWN_ROLE_KEY')
})

test('validateCustomRoleCounts: 음수·소수·문자열·누락 값은 보정하지 않고 거부한다', () => {
    for (const invalid of [-1, 1.5, '2', null, undefined, NaN, true]) {
        assert.equal(
            validateCustomRoleCounts(customCounts({ DOCTOR: invalid }), 8).reason,
            'INVALID_ROLE_COUNT',
            `DOCTOR=${String(invalid)}는 거부돼야 함`,
        )
    }
    const missingKey = { JOKER: 2, DOCTOR: 1, GUARD: 1 }
    assert.equal(validateCustomRoleCounts(missingKey, 8).reason, 'INVALID_ROLE_COUNT')
})

test('validateCustomRoleCounts: JOKER=0 · JOKER>=정원 · 합계>정원은 거부한다', () => {
    assert.equal(validateCustomRoleCounts(customCounts({ JOKER: 0 }), 8).reason, 'JOKER_COUNT_TOO_LOW')
    assert.equal(
        validateCustomRoleCounts({ JOKER: 4, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }, 4).reason,
        'JOKER_COUNT_TOO_HIGH',
    )
    assert.equal(
        validateCustomRoleCounts({ JOKER: 2, DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 0 }, 4).reason,
        'FIXED_ROLES_EXCEED_SLOTS',
    )
    // 합계가 정확히 정원과 같은 구성(시민 0명)은 허용된다.
    assert.equal(validateCustomRoleCounts({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, 4).ok, true)
})

// ── 특수직업 인원 상한(판정 2.2) ───────────────────────────────────────────

test('MAX_SPECIAL_ROLE_COUNT: 특수직업 공통 상한은 2명이다', () => {
    assert.equal(MAX_SPECIAL_ROLE_COUNT, 2)
})

test('validateCustomRoleCounts: 어떤 특수직업도 3명 이상이면 거부하고 2명까지는 통과한다', () => {
    for (const key of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        const overLimit = { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, [key]: 3 }
        assert.equal(
            validateCustomRoleCounts(overLimit, 10).reason,
            'ROLE_COUNT_ABOVE_LIMIT',
            `${key}=3은 거부돼야 함`,
        )
        const atLimit = { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, [key]: 2 }
        assert.equal(validateCustomRoleCounts(atLimit, 10).ok, true, `${key}=2는 통과해야 함`)
    }
})

test('validateCustomRoleCounts: 시민 수는 어떤 경우에도 거부 사유가 아니다(시민 0명 허용)', () => {
    // 고정 역할 합이 정확히 정원과 같아 시민이 0명이 되는 구성도, 시민이 8명 남는 구성도
    // 똑같이 통과한다 — CITIZEN에는 상한도 하한도 없다.
    assert.equal(validateCustomRoleCounts({ JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, 8).ok, true)
    assert.equal(validateCustomRoleCounts({ JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 }, 10).ok, true)
})

test('validateCustomRoleCounts: 상한 검사는 JOKER 교차 검증 뒤에 온다(4인 방 JOKER 4는 기존 코드 유지)', () => {
    assert.equal(
        validateCustomRoleCounts({ JOKER: 4, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }, 4).reason,
        'JOKER_COUNT_TOO_HIGH',
    )
})

test('validateCreateRoomRoleComposition: AUTO에서 광대 3명은 상한 메시지로 거부한다', () => {
    const result = validateCreateRoomRoleComposition(
        { roleCompositionMode: 'auto' },
        baseSettings({ maxPlayers: 8, jokerCount: 3 }),
    )
    assert.equal(result.ok, false)
    assert.equal(result.message, `역할별 인원은 최대 ${MAX_SPECIAL_ROLE_COUNT}명까지 지정할 수 있습니다.`)
    // 상한 안(2명)이면 그대로 통과한다.
    assert.equal(validateCreateRoomRoleComposition({ roleCompositionMode: 'auto' }, baseSettings()).ok, true)
})

test('validateCreateRoomRoleComposition: CUSTOM에서 의사 3명은 상한 메시지로 거부한다', () => {
    const result = validateCreateRoomRoleComposition(
        { roleCompositionMode: 'custom', roleCounts: customCounts({ DOCTOR: 3 }) },
        baseSettings(),
    )
    assert.equal(result.ok, false)
    assert.equal(result.message, `역할별 인원은 최대 ${MAX_SPECIAL_ROLE_COUNT}명까지 지정할 수 있습니다.`)
})

test('resolveRoleComposition: 시작 시점에도 상한을 다시 강제한다(AUTO 광대 3 · CUSTOM 경비 3)', () => {
    assert.equal(resolveRoleComposition({ jokerCount: 3 }, 8).reason, 'ROLE_COUNT_ABOVE_LIMIT')
    const custom = {
        roleCompositionMode: 'custom',
        jokerCount: 1,
        roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 3, WITCH_HUNTER: 0 },
    }
    assert.equal(resolveRoleComposition(custom, 8).reason, 'ROLE_COUNT_ABOVE_LIMIT')
})

// ── create_room 병합 검증 ──────────────────────────────────────────────────

test('validateCreateRoomRoleComposition: 모드가 없으면 AUTO로 해석되고 roleCounts를 만들지 않는다', () => {
    const result = validateCreateRoomRoleComposition({ maxPlayers: 8, jokerCount: 2 }, baseSettings())
    assert.deepEqual(result, { ok: true, value: { roleCompositionMode: 'auto' } })
})

test('validateCreateRoomRoleComposition: AUTO인데 roleCounts를 함께 보내면 거부한다', () => {
    const result = validateCreateRoomRoleComposition(
        { roleCompositionMode: 'auto', roleCounts: customCounts() },
        baseSettings(),
    )
    assert.equal(result.ok, false)
    assert.equal(typeof result.message, 'string')
})

test('validateCreateRoomRoleComposition: CUSTOM은 canonical 복사본을 돌려준다', () => {
    const payload = { roleCompositionMode: 'custom', roleCounts: customCounts() }
    const result = validateCreateRoomRoleComposition(payload, baseSettings())

    assert.equal(result.ok, true)
    assert.equal(result.value.roleCompositionMode, 'custom')
    assert.deepEqual(Object.keys(result.value.roleCounts), ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    assert.notEqual(result.value.roleCounts, payload.roleCounts)
})

test('validateCreateRoomRoleComposition: jokerCount와 roleCounts.JOKER가 다르면 거부한다', () => {
    const result = validateCreateRoomRoleComposition(
        { roleCompositionMode: 'custom', roleCounts: customCounts({ JOKER: 3 }) },
        baseSettings({ jokerCount: 2 }),
    )
    assert.equal(result.ok, false)
})

test('validateCreateRoomRoleComposition: 알 수 없는 모드 값은 거부한다', () => {
    const result = validateCreateRoomRoleComposition({ roleCompositionMode: 'AUTO' }, baseSettings())
    assert.equal(result.ok, false)
})

// ── 실제 인원 기준 해석 ────────────────────────────────────────────────────

test('resolveRoleComposition: AUTO는 기존 computeRoleComposition 결과와 동일하다', () => {
    // jokerCount는 특수직업 상한(MAX_SPECIAL_ROLE_COUNT=2) 안의 값만 쓴다 — 3명 이상은 AUTO에서도
    // 거부되므로(아래 상한 테스트) 여기서 쓰면 "AUTO 계산이 동일하다"는 계약을 검증할 수 없다.
    for (const [playerCount, jokerCount] of [[4, 1], [6, 2], [8, 2], [10, 2]]) {
        const resolved = resolveRoleComposition({ jokerCount }, playerCount)
        assert.equal(resolved.ok, true)
        assert.deepEqual(resolved.composition, computeRoleComposition(playerCount, jokerCount))
    }
    // settings 자체가 없는 구버전 방(랜덤 매칭)도 jokerCount 0의 AUTO로 해석된다.
    assert.deepEqual(resolveRoleComposition(undefined, 5).composition, computeRoleComposition(5, 0))
})

test('resolveRoleComposition: CUSTOM은 실제 인원에서 CITIZEN을 파생한다', () => {
    const settings = {
        roleCompositionMode: 'custom',
        jokerCount: 2,
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 },
    }
    const resolved = resolveRoleComposition(settings, 7)

    assert.equal(resolved.ok, true)
    assert.deepEqual(resolved.composition, { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 3 })
    // 정원(8)이 아니라 실제 인원(7)으로 계산된다 — 인원이 줄면 시민만 줄어든다.
    assert.equal(resolveRoleComposition(settings, 5).composition.CITIZEN, 1)
})

test('resolveRoleComposition: CUSTOM 고정 역할 합이 실제 인원을 넘으면 거부한다', () => {
    const settings = {
        roleCompositionMode: 'custom',
        jokerCount: 2,
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    }
    assert.equal(resolveRoleComposition(settings, 5).ok, true)
    const tooFew = resolveRoleComposition(settings, 4)
    assert.equal(tooFew.ok, false)
    assert.equal(tooFew.reason, 'FIXED_ROLES_EXCEED_SLOTS')
})

test('resolveRoleComposition: CUSTOM JOKER가 실제 인원 이상이면 거부한다', () => {
    const settings = {
        roleCompositionMode: 'custom',
        jokerCount: 2,
        roleCounts: { JOKER: 2, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 },
    }
    assert.equal(resolveRoleComposition(settings, 3).ok, true)
    assert.equal(resolveRoleComposition(settings, 2).reason, 'JOKER_COUNT_TOO_HIGH')
})

test('resolveRoleComposition: 저장된 jokerCount와 roleCounts.JOKER가 어긋나면 거부한다', () => {
    const tampered = {
        roleCompositionMode: 'custom',
        jokerCount: 1,
        roleCounts: { JOKER: 2, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 },
    }
    assert.equal(resolveRoleComposition(tampered, 8).reason, 'JOKER_COUNT_MISMATCH')
})

test('resolveRoleComposition: AUTO에서 jokerCount가 실제 인원 이상이면 거부한다', () => {
    assert.equal(resolveRoleComposition({ jokerCount: 3 }, 3).reason, 'JOKER_COUNT_TOO_HIGH')
    assert.equal(resolveRoleComposition({ jokerCount: 1.5 }, 8).reason, 'INVALID_JOKER_COUNT')
})

// ── commit 경계용 재검증 ───────────────────────────────────────────────────

test('validateResolvedComposition: 합계·JOKER 일치·키 구성을 모두 확인한다', () => {
    const valid = { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 4 }
    assert.equal(validateResolvedComposition(valid, 8, 2).ok, true)
    assert.equal(validateResolvedComposition(valid, 7, 2).reason, 'TOTAL_MISMATCH')
    assert.equal(validateResolvedComposition(valid, 8, 1).reason, 'JOKER_COUNT_MISMATCH')
    assert.equal(validateResolvedComposition({ ...valid, EXTRA: 0 }, 8, 2).reason, 'UNEXPECTED_KEYS')
    assert.equal(validateResolvedComposition({ JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 }, 8, 2).reason, 'UNEXPECTED_KEYS')
    assert.equal(validateResolvedComposition({ ...valid, CITIZEN: -1 }, 8, 2).reason, 'INVALID_ROLE_COUNT')
    assert.equal(validateResolvedComposition(null, 8, 2).reason, 'NOT_OBJECT')
})
