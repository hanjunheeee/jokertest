const test = require('node:test')
const assert = require('node:assert/strict')
const {
    validateCreateRoomPayload,
    validateRoleNightActionTimes,
    ROLE_NIGHT_ACTION_TIME_KEYS,
    ALLOWED_ROLE_NIGHT_ACTION_TIME,
} = require('../../../validations/room/create')

function validPayload(overrides = {}) {
    return {
        accessType: 'open',
        maxPlayers: 8,
        jokerCount: 2,
        lightsOut: false,
        soulBetting: false,
        dayDiscussionTime: 60,
        dayVoteTime: 60,
        nightActionTime: 90,
        voteReveal: true,
        ...overrides,
    }
}

test('object가 아닌 payload는 거부한다', () => {
    for (const bad of [null, [], 'string', 42, undefined, true]) {
        assert.equal(validateCreateRoomPayload(bad).ok, false)
    }
})

test('정상 payload는 통과하고 settings로 묶인다', () => {
    const result = validateCreateRoomPayload(validPayload())
    assert.equal(result.ok, true)
    assert.equal(result.value.accessType, 'open')
    assert.equal(result.value.settings.maxPlayers, 8)
})

// NODE_ENV 잠깐 바꿔 돌리고 원래대로
function withNodeEnv(value, run) {
    const original = process.env.NODE_ENV
    if (value === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = value
    try {
        run()
    } finally {
        if (original === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = original
    }
}

test('운영(NODE_ENV=production) maxPlayers는 게임 규칙(한 판 5~10명)대로 5~10 정수만 허용한다 (4명 방 거절)', () => {
    withNodeEnv('production', () => {
        for (const value of [5, 6, 7, 8, 9, 10]) {
            assert.equal(validateCreateRoomPayload(validPayload({ maxPlayers: value })).ok, true, `maxPlayers=${value}는 허용돼야 함`)
        }
        for (const value of [3, 4, 11, 4.5, '5', null, undefined]) {
            assert.equal(validateCreateRoomPayload(validPayload({ maxPlayers: value })).ok, false, `maxPlayers=${value}는 거부돼야 함`)
        }
    })
})

test('개발(NODE_ENV 운영 아님) maxPlayers는 개발 편의로 4~10 정수를 허용한다', () => {
    withNodeEnv(undefined, () => {
        for (const value of [4, 5, 6, 7, 8, 9, 10]) {
            assert.equal(validateCreateRoomPayload(validPayload({ maxPlayers: value })).ok, true, `maxPlayers=${value}는 허용돼야 함`)
        }
        for (const value of [3, 11, 4.5, '4', null, undefined]) {
            assert.equal(validateCreateRoomPayload(validPayload({ maxPlayers: value })).ok, false, `maxPlayers=${value}는 거부돼야 함`)
        }
    })
})

test('jokerCount는 역할 구성 규칙(광대 최대 2명)대로 1~2 정수만 허용한다', () => {
    for (const value of [0, 3, 4, 5, 2.5, '2']) {
        assert.equal(validateCreateRoomPayload(validPayload({ jokerCount: value })).ok, false, `jokerCount=${value}는 거부돼야 함`)
    }
    assert.equal(validateCreateRoomPayload(validPayload({ jokerCount: 1, maxPlayers: 5 })).ok, true)
    assert.equal(validateCreateRoomPayload(validPayload({ jokerCount: 2, maxPlayers: 5 })).ok, true)
})

test('시간 필드는 정해진 step 값만 허용한다', () => {
    assert.equal(validateCreateRoomPayload(validPayload({ dayDiscussionTime: 45 })).ok, false)
    assert.equal(validateCreateRoomPayload(validPayload({ dayDiscussionTime: 150 })).ok, true)
    assert.equal(validateCreateRoomPayload(validPayload({ dayVoteTime: 100 })).ok, false)
    assert.equal(validateCreateRoomPayload(validPayload({ nightActionTime: 200 })).ok, false)
})

test('boolean 필드는 truthy 값을 강제 변환하지 않는다', () => {
    assert.equal(validateCreateRoomPayload(validPayload({ lightsOut: 1 })).ok, false)
    assert.equal(validateCreateRoomPayload(validPayload({ soulBetting: 'true' })).ok, false)
    assert.equal(validateCreateRoomPayload(validPayload({ voteReveal: 0 })).ok, false)
})

test('accessType은 open/code 문자열만 허용하고 boolean을 강제 변환하지 않는다', () => {
    assert.equal(validateCreateRoomPayload(validPayload({ accessType: true })).ok, false)
    assert.equal(validateCreateRoomPayload(validPayload({ accessType: false })).ok, false)
    assert.equal(validateCreateRoomPayload(validPayload({ accessType: 'private' })).ok, false)
})

test('서버 권한 필드(uuid 등)는 결과 value에 포함되지 않는다', () => {
    const result = validateCreateRoomPayload(
        validPayload({ uuid: 'attacker', hostUuid: 'attacker', players: ['x'], title: 'x', status: 'ACTIVE' })
    )
    assert.equal(result.ok, true)
    const serialized = JSON.stringify(result.value)
    assert.ok(!serialized.includes('attacker'))
    assert.equal(result.value.title, undefined)
    assert.equal(result.value.status, undefined)
})

test('직업별 밤 시간을 지정하지 않으면 통과하고 settings에 키 자체가 생기지 않는다', () => {
    const result = validateCreateRoomPayload(validPayload())
    assert.equal(result.ok, true)
    assert.equal(Object.hasOwn(result.value.settings, 'roleNightActionTimes'), false)
})

test('직업별 밤 시간은 알려진 역할 키와 허용된 값만 통과시킨다', () => {
    const result = validateCreateRoomPayload(
        validPayload({ roleNightActionTimes: { JOKER: 30, DOCTOR: 60, GUARD: 90, WITCH_HUNTER: 120 } }),
    )
    assert.equal(result.ok, true)
    assert.deepEqual(result.value.settings.roleNightActionTimes, {
        JOKER: 30,
        DOCTOR: 60,
        GUARD: 90,
        WITCH_HUNTER: 120,
    })
    assert.deepEqual([...ALLOWED_ROLE_NIGHT_ACTION_TIME], [30, 60, 90, 120])
    assert.deepEqual([...ROLE_NIGHT_ACTION_TIME_KEYS], ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
})

test('일부 직업만 지정해도 통과하고, 지정한 직업만 settings에 담긴다', () => {
    const result = validateCreateRoomPayload(validPayload({ roleNightActionTimes: { GUARD: 120 } }))
    assert.equal(result.ok, true)
    assert.deepEqual(result.value.settings.roleNightActionTimes, { GUARD: 120 })
    assert.equal(result.value.settings.nightActionTime, 90)
})

test('허용 목록 밖의 값은 보정하지 않고 거부한다', () => {
    for (const bad of [45, 0, -30, 150, 30.5, '30', null, undefined, true, [], {}]) {
        assert.equal(
            validateCreateRoomPayload(validPayload({ roleNightActionTimes: { JOKER: bad } })).ok,
            false,
            `JOKER=${String(bad)}는 거부돼야 함`,
        )
    }
})

test('알 수 없는 역할 키는 조용히 무시하지 않고 거부한다', () => {
    for (const key of ['CITIZEN', 'joker', 'hostUuid', '']) {
        assert.equal(
            validateCreateRoomPayload(validPayload({ roleNightActionTimes: { [key]: 30 } })).ok,
            false,
            `${key} 키는 거부돼야 함`,
        )
    }
})

test('roleNightActionTimes가 객체가 아니면 거부한다', () => {
    for (const bad of [null, [], 'x', 30, true]) {
        assert.equal(validateCreateRoomPayload(validPayload({ roleNightActionTimes: bad })).ok, false)
    }
})

test('validateRoleNightActionTimes는 클라이언트 객체를 그대로 담지 않고 새로 만든다', () => {
    const raw = { JOKER: 30 }
    const result = validateRoleNightActionTimes(raw)
    assert.equal(result.ok, true)
    assert.notEqual(result.value, raw, '입력 객체 참조를 그대로 저장하지 않는다')
    assert.deepEqual(result.value, { JOKER: 30 })

    assert.deepEqual(validateRoleNightActionTimes(undefined), { ok: true, value: undefined })
    assert.deepEqual(validateRoleNightActionTimes({}), { ok: true, value: {} })
})

// 재판 시간 (사용자 결정 2026-11-09: 방 설정 칸, 기본 = 낮 투표 시간)
test('재판 시간: 안 보내거나 낮 투표 시간과 같으면 칸 없음(낮 투표 시간을 따라감), 15~120초 15초 간격만 받음', () => {
    const omitted = validateCreateRoomPayload(validPayload())
    assert.equal(omitted.ok, true)
    assert.equal(Object.hasOwn(omitted.value.settings, 'tribunalTime'), false)

    for (const seconds of [15, 30, 45, 60, 75, 90, 105, 120]) {
        const result = validateCreateRoomPayload(validPayload({ tribunalTime: seconds }))
        assert.equal(result.ok, true, `${seconds}초`)
        // 낮 투표 시간(60초)과 같으면 담지 않음
        assert.equal(result.value.settings.tribunalTime, seconds === 60 ? undefined : seconds)
    }
    for (const bad of [0, 10, 20, 135, 150, -15, 30.5, '30', null, true]) {
        const result = validateCreateRoomPayload(validPayload({ tribunalTime: bad }))
        assert.equal(result.ok, false, `${String(bad)}는 거절`)
        assert.equal(result.message, '재판 시간 값이 올바르지 않습니다.')
    }
})
