const test = require('node:test')
const assert = require('node:assert/strict')
const { validateCreateRoomPayload } = require('../createRoomValidation')

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

test('maxPlayers는 UI가 선택 가능한 4~10 정수만 허용한다', () => {
    for (const value of [4, 5, 6, 7, 8, 9, 10]) {
        assert.equal(validateCreateRoomPayload(validPayload({ maxPlayers: value })).ok, true, `maxPlayers=${value}는 허용돼야 함`)
    }
    for (const value of [3, 11, 4.5, '4', null, undefined]) {
        assert.equal(validateCreateRoomPayload(validPayload({ maxPlayers: value })).ok, false, `maxPlayers=${value}는 거부돼야 함`)
    }
})

test('jokerCount는 1~4 정수이면서 maxPlayers보다 작아야 한다', () => {
    for (const value of [0, 5, 2.5, '2']) {
        assert.equal(validateCreateRoomPayload(validPayload({ jokerCount: value })).ok, false)
    }
    assert.equal(validateCreateRoomPayload(validPayload({ jokerCount: 4, maxPlayers: 4 })).ok, false)
    assert.equal(validateCreateRoomPayload(validPayload({ jokerCount: 3, maxPlayers: 4 })).ok, true)
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
