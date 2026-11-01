process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    validateUpdateRoomSettingsPayload,
    buildEditableSettingsView,
    buildRoomSettingsView,
    fingerprintUpdateSettings,
    ROOM_SETTINGS_ERROR_CODES,
    ROOM_SETTINGS_EVENTS,
    MAX_IDENTIFIER_LENGTH,
} = require('../../utils/updateRoomSettingsValidation')
const matchmaking = require('../../socket/matchmaking')

function validPayload(overrides = {}) {
    return {
        roomId: 'room-1',
        requestId: 'req-1',
        expectedSettingsVersion: 1,
        accessType: 'open',
        maxPlayers: 8,
        jokerCount: 2,
        roleCompositionMode: 'auto',
        dayDiscussionTime: 60,
        dayVoteTime: 60,
        nightActionTime: 90,
        ...overrides,
    }
}

test('정상 요청은 명시한 필드만 담은 새 설정 객체를 만든다', () => {
    const result = validateUpdateRoomSettingsPayload(validPayload())
    assert.equal(result.ok, true)
    assert.deepEqual(Object.keys(result.value).sort(),
        ['accessType', 'expectedSettingsVersion', 'requestId', 'roomId', 'settings'])
    assert.deepEqual(result.value.settings, {
        maxPlayers: 8,
        jokerCount: 2,
        dayDiscussionTime: 60,
        dayVoteTime: 60,
        nightActionTime: 90,
        roleCompositionMode: 'auto',
    })
    for (const key of ['lightsOut', 'soulBetting', 'voteReveal']) {
        assert.equal(Object.hasOwn(result.value.settings, key), false)
    }
})

test('최상위 허용 목록 밖의 키는 조용히 버리지 않고 거부한다', () => {
    for (const key of ['allowSpectators', 'allow-spectators', 'spectator', 'lightsOut', 'voteReveal',
        'settingsVersion', 'hostUuid', 'players', 'roomCode', 'title', 'status']) {
        const result = validateUpdateRoomSettingsPayload(validPayload({ [key]: true }))
        assert.equal(result.ok, false, `${key}가 거부되지 않았다`)
        assert.equal(result.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }
})

test('식별자와 기대 버전은 형태를 엄격히 검사한다', () => {
    const bad = [
        { roomId: '' }, { roomId: '   ' }, { roomId: 123 }, { roomId: null },
        { roomId: 'x'.repeat(MAX_IDENTIFIER_LENGTH + 1) },
        { requestId: '' }, { requestId: 0 }, { requestId: {} },
        { expectedSettingsVersion: 0 }, { expectedSettingsVersion: -1 },
        { expectedSettingsVersion: 1.5 }, { expectedSettingsVersion: '1' },
        { expectedSettingsVersion: Number.MAX_SAFE_INTEGER + 2 },
    ]
    for (const overrides of bad) {
        const result = validateUpdateRoomSettingsPayload(validPayload(overrides))
        assert.equal(result.ok, false, `거부되지 않은 입력: ${JSON.stringify(overrides)}`)
    }
})

test('객체가 아닌 payload는 구조분해 예외 없이 거부된다', () => {
    for (const payload of [null, undefined, 'x', 1, [], true]) {
        const result = validateUpdateRoomSettingsPayload(payload)
        assert.equal(result.ok, false)
        assert.equal(result.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }
})

test('값의 허용 목록은 생성 검증과 같다 — 목록 밖 값은 보정하지 않고 거부한다', () => {
    const bad = [
        { accessType: 'private' }, { accessType: null },
        { maxPlayers: 3 }, { maxPlayers: 11 }, { maxPlayers: '8' },
        { jokerCount: 0 }, { jokerCount: 5 },
        { dayDiscussionTime: 45 }, { dayVoteTime: 120 }, { nightActionTime: 150 },
        { roleNightActionTimes: { JOKER: 45 } },
        { roleNightActionTimes: { CITIZEN: 60 } },
        { roleNightActionTimes: [] },
    ]
    for (const overrides of bad) {
        const result = validateUpdateRoomSettingsPayload(validPayload(overrides))
        assert.equal(result.ok, false, `거부되지 않은 입력: ${JSON.stringify(overrides)}`)
    }
})

test('광대 수는 정원보다 적어야 하고, 역할 계약의 2명 상한이 수정 경로에도 집행된다', () => {
    assert.equal(validateUpdateRoomSettingsPayload(
        validPayload({ maxPlayers: 4, jokerCount: 4 })).ok, false)
    assert.equal(validateUpdateRoomSettingsPayload(
        validPayload({ maxPlayers: 8, jokerCount: 3 })).ok, false)
    assert.equal(validateUpdateRoomSettingsPayload(
        validPayload({ maxPlayers: 8, jokerCount: 2 })).ok, true)
})

test('CUSTOM 역할 구성은 canonical 복사본으로만 저장되고 AUTO는 roleCounts를 만들지 않는다', () => {
    const custom = validateUpdateRoomSettingsPayload(validPayload({
        roleCompositionMode: 'custom',
        jokerCount: 1,
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    }))
    assert.equal(custom.ok, true)
    assert.deepEqual(custom.value.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })

    const auto = validateUpdateRoomSettingsPayload(validPayload({ roleCompositionMode: 'auto' }))
    assert.equal(Object.hasOwn(auto.value.settings, 'roleCounts'), false)

    assert.equal(validateUpdateRoomSettingsPayload(validPayload({
        roleCompositionMode: 'auto', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 },
    })).ok, false)
})

test('검증 결과는 입력과 독립적인 새 객체다(나중에 입력을 바꿔도 따라 바뀌지 않는다)', () => {
    const payload = validPayload({
        roleCompositionMode: 'custom',
        jokerCount: 1,
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
        roleNightActionTimes: { JOKER: 30 },
    })
    const result = validateUpdateRoomSettingsPayload(payload)
    payload.roleCounts.JOKER = 99
    payload.roleNightActionTimes.JOKER = 120
    assert.equal(result.value.settings.roleCounts.JOKER, 1)
    assert.equal(result.value.settings.roleNightActionTimes.JOKER, 30)
})

test('설정 뷰는 허용 필드만 새 객체로 옮기고 관전자·알 수 없는 키를 버린다', () => {
    const stored = {
        maxPlayers: 6, jokerCount: 1, roleCompositionMode: 'custom',
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 4 },
        dayDiscussionTime: 90, dayVoteTime: 30, nightActionTime: 60,
        roleNightActionTimes: { JOKER: 30, CITIZEN: 10 },
        lightsOut: true, soulBetting: false, voteReveal: true,
        allowSpectators: true, 'allow-spectators': true, legacyJunk: 'x',
    }

    const editable = buildEditableSettingsView(stored)
    assert.equal(JSON.stringify(editable).includes('pectator'), false)
    assert.equal(Object.hasOwn(editable, 'legacyJunk'), false)
    assert.deepEqual(editable.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
    assert.deepEqual(editable.roleNightActionTimes, { JOKER: 30 })
    for (const key of ['lightsOut', 'soulBetting', 'voteReveal']) {
        assert.equal(Object.hasOwn(editable, key), false)
    }

    const full = buildRoomSettingsView(stored)
    assert.equal(JSON.stringify(full).includes('pectator'), false)
    assert.equal(full.lightsOut, true)
    assert.equal(full.voteReveal, true)

    stored.roleCounts.JOKER = 99
    assert.equal(editable.roleCounts.JOKER, 1)
})

test('지문은 같은 설정을 같은 값으로, 다른 설정을 다른 값으로 만든다(키 순서에 흔들리지 않는다)', () => {
    const a = fingerprintUpdateSettings('open', {
        maxPlayers: 8, jokerCount: 2, roleCompositionMode: 'auto',
        dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
    })
    const reordered = fingerprintUpdateSettings('open', {
        nightActionTime: 90, dayVoteTime: 60, dayDiscussionTime: 60,
        roleCompositionMode: 'auto', jokerCount: 2, maxPlayers: 8,
    })
    assert.equal(a, reordered)

    assert.notEqual(a, fingerprintUpdateSettings('code', {
        maxPlayers: 8, jokerCount: 2, roleCompositionMode: 'auto',
        dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
    }))
    assert.notEqual(a, fingerprintUpdateSettings('open', {
        maxPlayers: 6, jokerCount: 2, roleCompositionMode: 'auto',
        dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
    }))
    assert.notEqual(
        fingerprintUpdateSettings('open', { roleNightActionTimes: { JOKER: 30 } }),
        fingerprintUpdateSettings('open', { roleNightActionTimes: { JOKER: 60 } }),
    )
})

test('이벤트명·오류 코드는 소켓 계층이 다시 내보내는 값과 같은 참조다(배선 일치)', () => {
    assert.equal(matchmaking.ROOM_SETTINGS_EVENTS, ROOM_SETTINGS_EVENTS)
    assert.equal(matchmaking.ROOM_SETTINGS_ERROR_CODES, ROOM_SETTINGS_ERROR_CODES)
    assert.equal(ROOM_SETTINGS_EVENTS.UPDATE_ROOM_SETTINGS, 'update_room_settings')
    assert.equal(ROOM_SETTINGS_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, 'get_room_settings_update_result')
    assert.equal(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED, 'room_settings_updated')
})
