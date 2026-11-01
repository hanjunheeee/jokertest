process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../../socket/matchmaking')
const gameSessionCore = require('../../game-core/gameSession')

matchmaking.__setUserRepositoryForTests({
    findByUuid: async (uuid) => ({ nickname: `user-${uuid}` }),
})

let startLoadoutGate = null
let startLoadoutCalls = 0

function createStartGate() {
    let release
    let signalEntered
    const entered = new Promise((resolve) => { signalEntered = resolve })
    const blocked = new Promise((resolve) => { release = resolve })
    return { entered, release: () => release(), onEnter: () => { signalEntered(); return blocked } }
}

let onStartLoadoutsRead = null

matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (userIds) => {
        startLoadoutCalls += 1
        if (startLoadoutGate) await startLoadoutGate.onEnter()
        const base = Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null, profileBorderId: null, cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))
        if (!onStartLoadoutsRead) return base
        const hook = onStartLoadoutsRead
        onStartLoadoutsRead = null
        let fired = false
        return new Proxy(base, {
            get(target, prop, receiver) {
                if (!fired && typeof prop === 'string' && Object.hasOwn(target, prop)) {
                    fired = true
                    hook()
                }
                return Reflect.get(target, prop, receiver)
            },
        })
    },
    getEmojiPalette: async () => ({ slots: Array(8).fill(null), owned: [] }),
})
matchmaking.__setGameInviteServiceForTests({
    cancelPendingInvitesForRoom: async () => {},
})

let recordSummaryGate = null
let recordSummaryCalls = 0
let recordSummaryShouldReject = false

matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (userIds) => {
        recordSummaryCalls += 1
        if (recordSummaryGate) await recordSummaryGate.onEnter()
        if (recordSummaryShouldReject) throw new Error('전적 조회 실패(테스트 주입)')
        return new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }]))
    },
})

const {
    createFakeSocket,
    createFakeIo,
    callAsPromise,
    validSettingsPayload,
    readyPayload,
    startPayload,
} = require('../helpers/matchmakingFixtures')

const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleGetPublicRooms,
    handleSetReady,
    handleStartGame,
    handleUpdateRoomSettings,
    handleGetRoomSettingsUpdateResult,
} = matchmaking.__testables

const { ROOM_SETTINGS_ERROR_CODES, ROOM_SETTINGS_EVENTS } = matchmaking
const { MAX_IDENTIFIER_LENGTH } = require('../../validations/room/updateSettings')

function findSpectatorKeys(value, path = '$') {
    if (value === null || typeof value !== 'object') return []
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => findSpectatorKeys(item, `${path}[${index}]`))
    }
    const found = []
    for (const [key, child] of Object.entries(value)) {
        const here = `${path}.${key}`
        if (key.toLowerCase().includes('spectator')) found.push(here)
        found.push(...findSpectatorKeys(child, here))
    }
    return found
}

function assertNoSpectatorKeys(value, where) {
    const found = findSpectatorKeys(value)
    assert.deepEqual(found, [], `${where}에 폐기된 관전 키가 남아 있다: ${found.join(', ')}`)
}

const NORMAL_ROLE_KEYS = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']

test('AC-06 · 폐기 키 검출기는 중첩·대문자 SPECTATOR까지 각각 단독 주입에서 검출한다', () => {
    for (const key of ['allowSpectators', 'allow-spectators', 'spectator', 'spectatorMode', 'SPECTATOR']) {
        assert.deepEqual(
            findSpectatorKeys({ maxPlayers: 8, [key]: true }), [`$.${key}`],
            `최상위 ${key}를 검출하지 못했다`,
        )
    }
    assert.deepEqual(
        findSpectatorKeys({ roleCounts: { JOKER: 2, DOCTOR: 1, SPECTATOR: 1 } }),
        ['$.roleCounts.SPECTATOR'], 'roleCounts.SPECTATOR를 검출하지 못했다',
    )
    assert.deepEqual(
        findSpectatorKeys({ roleNightActionTimes: { JOKER: 30, SPECTATOR: 30 } }),
        ['$.roleNightActionTimes.SPECTATOR'], 'roleNightActionTimes.SPECTATOR를 검출하지 못했다',
    )
    assert.deepEqual(
        findSpectatorKeys({ players: [{ uuid: 'a' }, { uuid: 'b', allowSpectators: true }] }),
        ['$.players[1].allowSpectators'], '배열 안의 폐기 키를 검출하지 못했다',
    )
    assert.deepEqual(findSpectatorKeys({
        maxPlayers: 8, jokerCount: 2, voteReveal: true,
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
        roleNightActionTimes: { JOKER: 30 },
    }), [])
    assert.deepEqual(findSpectatorKeys({ nickname: 'spectator-fan', title: 'SPECTATOR' }), [])
})

test('AC-02 · 방 설정 허용 목록·요청 허용 키·역할 키·실제 저장 키가 전수로 고정된다', async () => {
    const validation = require('../../validations/room/updateSettings')
    const { CUSTOM_ROLE_KEYS } = require('../../game-core/roleComposition')
    const { ROLE_NIGHT_ACTION_TIME_KEYS } = require('../../validations/room/create')

    assert.deepEqual([...validation.EDITABLE_ROOM_SETTING_KEYS], [
        'maxPlayers', 'jokerCount', 'roleCompositionMode', 'roleCounts',
        'dayDiscussionTime', 'dayVoteTime', 'nightActionTime', 'roleNightActionTimes',
    ], '편집 가능 설정 허용 목록이 바뀌었다')
    assert.deepEqual([...validation.PRESERVED_ROOM_SETTING_KEYS],
        ['lightsOut', 'soulBetting', 'voteReveal'], '보존 설정 목록이 바뀌었다')
    assert.deepEqual([...validation.UPDATE_REQUEST_TOP_LEVEL_KEYS], [
        'roomId', 'requestId', 'expectedSettingsVersion', 'accessType',
        ...validation.EDITABLE_ROOM_SETTING_KEYS,
    ], '수정 요청 허용 키 목록이 바뀌었다')
    assert.deepEqual([...CUSTOM_ROLE_KEYS], [...NORMAL_ROLE_KEYS])
    assert.deepEqual([...ROLE_NIGHT_ACTION_TIME_KEYS], [...NORMAL_ROLE_KEYS])
    assert.deepEqual(ROOM_SETTINGS_EVENTS, {
        UPDATE_ROOM_SETTINGS: 'update_room_settings',
        GET_ROOM_SETTINGS_UPDATE_RESULT: 'get_room_settings_update_result',
        ROOM_SETTINGS_UPDATED: 'room_settings_updated',
    })

    const enumerated = [
        ...validation.EDITABLE_ROOM_SETTING_KEYS,
        ...validation.PRESERVED_ROOM_SETTING_KEYS,
        ...validation.UPDATE_REQUEST_TOP_LEVEL_KEYS,
        ...CUSTOM_ROLE_KEYS, ...ROLE_NIGHT_ACTION_TIME_KEYS,
        ...Object.values(ROOM_SETTINGS_EVENTS),
    ]
    assert.deepEqual(enumerated.filter((name) => /spectat|관전/i.test(name)), [],
        '허용 목록·사건 이름에 관전 항목이 있다')
    assert.deepEqual(['maxPlayers', 'allowSpectators'].filter((name) => /spectat|관전/i.test(name)),
        ['allowSpectators'])

    const io = createFakeIo([])
    const { room } = await createRoom(io, 'host-keys', { maxPlayers: 8, jokerCount: 2 })
    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    assert.deepEqual(Object.keys(stored).sort(), [
        'dayDiscussionTime', 'dayVoteTime', 'jokerCount', 'lightsOut', 'maxPlayers',
        'nightActionTime', 'roleCompositionMode', 'soulBetting', 'voteReveal',
    ], '서버가 저장하는 설정 키 집합이 바뀌었다')
    assertNoSpectatorKeys(stored, '생성 직후 서버 저장값')

    const current = await callAsPromise(handleGetCurrentRoom, 'host-keys')
    assert.equal(current.ok, true, current.message)
    assert.equal(current.room.roomId, room.roomId, '조회가 방금 만든 방을 돌려주지 않았다')
    assert.deepEqual(Object.keys(current.room.settings).sort(), [
        'dayDiscussionTime', 'dayVoteTime', 'jokerCount', 'lightsOut', 'maxPlayers',
        'nightActionTime', 'roleCompositionMode', 'soulBetting', 'voteReveal',
    ], '조회 응답의 설정 키 집합이 바뀌었다')
    assertNoSpectatorKeys(current.room, '생성 직후 조회 응답')
})

function snapshotRooms() {
    return JSON.stringify(matchmaking.__getStateSnapshotForTests().gameRooms)
}

function updatePayload(roomId, overrides = {}) {
    return {
        roomId,
        requestId: `req-${Math.random().toString(36).slice(2)}`,
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

async function createRoom(io, hostUuid, payloadOverrides = {}) {
    const hostSocket = createFakeSocket(hostUuid)
    io.sockets.sockets.set(hostSocket.id, hostSocket)
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload(payloadOverrides),
    )
    assert.equal(created.ok, true, created.message)
    return { hostSocket, room: created.room }
}

async function joinRoom(io, roomCode, uuid) {
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)
    await handleJoinRoomByCode(io, socket, uuid, roomCode)
    return socket
}

test.beforeEach(() => {
    startLoadoutGate = null
    startLoadoutCalls = 0
    onStartLoadoutsRead = null
    recordSummaryGate = null
    recordSummaryCalls = 0
    recordSummaryShouldReject = false
    matchmaking.__resetStateForTests()
    gameSessionCore.__resetStateForTests()
})

test('AC-01 · 방장이 아닌 참가자·외부인·다른 방 ID·미확정 입장·교체된 소켓의 저장은 모두 거부되고 상태가 변하지 않는다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoom(io, 'host-a')
    const joinerSocket = await joinRoom(io, room.roomCode, 'player-p')
    const outsiderSocket = createFakeSocket('outsider-x')
    io.sockets.sockets.set(outsiderSocket.id, outsiderSocket)

    const otherIo = createFakeIo([])
    const { room: roomB } = await createRoom(otherIo, 'host-b')

    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    const cases = [
        { socket: joinerSocket, uuid: 'player-p', payload: updatePayload(room.roomId), code: ROOM_SETTINGS_ERROR_CODES.NOT_HOST },
        { socket: outsiderSocket, uuid: 'outsider-x', payload: updatePayload(room.roomId), code: ROOM_SETTINGS_ERROR_CODES.NOT_IN_ROOM },
        { socket: io.sockets.sockets.get('sock-host-a'), uuid: 'host-a', payload: updatePayload(roomB.roomId), code: ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND },
        { socket: io.sockets.sockets.get('sock-host-a'), uuid: 'host-a', payload: updatePayload('no-such-room'), code: ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND },
    ]

    for (const { socket, uuid, payload, code } of cases) {
        const res = await callAsPromise(handleUpdateRoomSettings, io, socket, uuid, payload)
        assert.equal(res.ok, false, `${uuid}/${code} 요청이 거부되지 않았다`)
        assert.equal(res.code, code)
    }

    const forged = await callAsPromise(
        handleUpdateRoomSettings, io, joinerSocket, 'player-p',
        { ...updatePayload(room.roomId), hostUuid: 'player-p' },
    )
    assert.equal(forged.ok, false)
    assert.equal(forged.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)

    assert.equal(snapshotRooms(), before, '거부된 요청이 방 상태를 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsBefore, '거부된 요청이 방송을 발생시켰다')
})

test('AC-01 · 계정의 canonical 소켓이 교체된 뒤 도착한 옛 소켓의 저장은 STALE_SOCKET으로 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a')

    const getCurrentSocketId = () => 'sock-host-a-NEW'

    const before = snapshotRooms()
    const res = await new Promise((resolve) => handleUpdateRoomSettings(
        io, hostSocket, 'host-a', updatePayload(room.roomId, { maxPlayers: 6 }), resolve, getCurrentSocketId,
    ))
    assert.equal(res.ok, false)
    assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(snapshotRooms(), before)

    hostSocket.connected = false
    const disconnected = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, { maxPlayers: 6 }),
    )
    assert.equal(disconnected.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(snapshotRooms(), before)
})

test('AC-01 · 이미 성공한 요청의 재전달도 현재 연결을 먼저 인증하고, 유효한 연결의 멱등 재시도만 결과를 돌려준다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const requestId = 'req-replay-auth'
    const payload = updatePayload(room.roomId, { requestId, maxPlayers: 6 })
    const first = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', payload)
    assert.equal(first.ok, true, first.message)
    assert.equal(first.settingsVersion, 2)

    const afterCommit = snapshotRooms()
    const broadcastsAfterCommit = io.broadcasts.length

    hostSocket.connected = false
    const disconnectedReplay = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', { ...payload },
    )
    assert.equal(disconnectedReplay.ok, false, '끊긴 소켓의 재전달이 성공 결과를 받았다')
    assert.equal(disconnectedReplay.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(disconnectedReplay.settingsVersion, undefined, '거부 응답이 저장 결과를 흘렸다')

    hostSocket.connected = true
    const replacedReplay = await new Promise((resolve) => handleUpdateRoomSettings(
        io, hostSocket, 'host-a', { ...payload }, resolve, () => 'sock-host-a-NEW',
    ))
    assert.equal(replacedReplay.ok, false, '교체된 소켓의 재전달이 성공 결과를 받았다')
    assert.equal(replacedReplay.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)

    const validReplay = await new Promise((resolve) => handleUpdateRoomSettings(
        io, hostSocket, 'host-a', { ...payload }, resolve, () => hostSocket.id,
    ))
    assert.equal(validReplay.ok, true, validReplay.message)
    assert.equal(validReplay.replayed, true)
    assert.equal(validReplay.settingsVersion, 2, '재전달이 버전을 다시 올렸다')

    const reused = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', { ...payload, maxPlayers: 10 },
    )
    assert.equal(reused.code, ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED)

    assert.equal(snapshotRooms(), afterCommit, '재전달이 방 상태를 다시 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsAfterCommit, '재전달이 방송을 다시 발생시켰다')
})

test('AC-01 · 결과 조회도 끊기거나 교체된 소켓에서는 기록을 읽지 못한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const requestId = 'req-lookup-auth'
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))

    const lookupArgs = { roomId: room.roomId, requestId }

    hostSocket.connected = false
    const disconnected = await new Promise((resolve) =>
        handleGetRoomSettingsUpdateResult('host-a', lookupArgs, resolve, hostSocket))
    assert.equal(disconnected.ok, false)
    assert.equal(disconnected.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(disconnected.status, undefined, '거부 응답이 적용 여부를 흘렸다')

    hostSocket.connected = true
    const replaced = await new Promise((resolve) =>
        handleGetRoomSettingsUpdateResult('host-a', lookupArgs, resolve, hostSocket, () => 'sock-host-a-NEW'))
    assert.equal(replaced.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)

    const live = await new Promise((resolve) =>
        handleGetRoomSettingsUpdateResult('host-a', lookupArgs, resolve, hostSocket, () => hostSocket.id))
    assert.equal(live.status, 'APPLIED')
    assert.equal(live.settingsVersion, 2)
})

test('AC-01 · 미확정 입장(예약) 상태의 요청자는 설정을 저장할 수 없다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a')
    matchmaking.__seedAdmissionAttemptForTests('host-a', { roomId: room.roomId, phase: 'reserved' })

    const before = snapshotRooms()
    const res = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, { maxPlayers: 6 }),
    )
    assert.equal(res.ok, false)
    assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.ADMISSION_PENDING)
    assert.equal(snapshotRooms(), before)
})

test('AC-02 · 현재 참가 인원보다 작은 정원은 거부되고, 인원 이상이면 저장된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 1 })
    await joinRoom(io, room.roomCode, 'p1')
    await joinRoom(io, room.roomCode, 'p2')
    await joinRoom(io, room.roomCode, 'p3')
    await joinRoom(io, room.roomCode, 'p4')

    const before = snapshotRooms()
    const tooSmall = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(tooSmall.ok, false)
    assert.equal(tooSmall.code, ROOM_SETTINGS_ERROR_CODES.MAX_PLAYERS_BELOW_OCCUPANCY)
    assert.equal(tooSmall.occupancy, 5)
    assert.equal(snapshotRooms(), before, '거부된 축소가 저장을 바꿨다')

    const exact = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 5, jokerCount: 1 }),
    )
    assert.equal(exact.ok, true, exact.message)
    assert.equal(exact.changed, true)
    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(stored.settings.maxPlayers, 5)
})

test('AC-02 · 유효한 reserved 예약도 점유로 세고, 예약이 만료되면 같은 축소가 허용된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 1 })
    await joinRoom(io, room.roomCode, 'p1')
    await joinRoom(io, room.roomCode, 'p2')
    await joinRoom(io, room.roomCode, 'p3')
    matchmaking.__seedAdmissionAttemptForTests('invited-1', { roomId: room.roomId, phase: 'reserved' })

    const blocked = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(blocked.code, ROOM_SETTINGS_ERROR_CODES.MAX_PLAYERS_BELOW_OCCUPANCY)
    assert.equal(blocked.occupancy, 5, '확정 4명 + 예약 1명이 5로 세어져야 한다')

    matchmaking.__expireAdmissionAttemptForTests('invited-1')
    const allowed = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(allowed.ok, true, allowed.message)
})

test('AC-02 · published 입장은 room.players와 예약에서 중복으로 세지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    await joinRoom(io, room.roomCode, 'p1')
    await joinRoom(io, room.roomCode, 'p2')
    await joinRoom(io, room.roomCode, 'p3')
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms[0][1].players.length, 4)
    matchmaking.__seedAdmissionAttemptForTests('p3', { roomId: room.roomId, phase: 'published' })

    const res = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(res.ok, true, `published가 중복 계산됐다: ${JSON.stringify(res)}`)
    assert.equal(res.occupancy, undefined)
})

test('AC-03 · 입장 방식·정원·역할 구성·직업별 밤 시간을 저장하면 참가자 응답과 공개 목록에 즉시 반영된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, {
        accessType: 'code',
        maxPlayers: 6,
        jokerCount: 1,
        roleCompositionMode: 'custom',
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
        dayDiscussionTime: 90,
        dayVoteTime: 30,
        nightActionTime: 60,
        roleNightActionTimes: { JOKER: 30, GUARD: 120 },
    }))
    assert.equal(res.ok, true, res.message)
    assert.equal(res.changed, true)
    assert.equal(res.settingsVersion, 2)

    const current = await callAsPromise(handleGetCurrentRoom, 'p1')
    assert.equal(current.room.accessType, 'code')
    assert.equal(current.room.settingsVersion, 2)
    assert.deepEqual(current.room.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
    assert.deepEqual(current.room.settings.roleNightActionTimes, { JOKER: 30, GUARD: 120 })
    assert.equal(current.room.settings.dayDiscussionTime, 90)
    assert.equal(current.room.settings.dayVoteTime, 30)
    assert.equal(current.room.settings.nightActionTime, 60)
    assert.equal(current.room.settings.maxPlayers, 6)

    const delivered = joinerSocket.emitted.filter((e) => e.event === ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED)
    assert.equal(delivered.length, 1)
    assert.equal(delivered[0].payload.settingsVersion, 2)
    assert.equal(delivered[0].payload.accessType, 'code')
    assert.equal(delivered[0].payload.canStart, false)

    const list = await callAsPromise(handleGetPublicRooms)
    const listed = list.rooms.find((r) => r.id === room.roomId)
    assert.equal(listed.accessType, 'code')
    assert.equal(listed.max, 6)
    assert.equal(listed.settingsVersion, 2)
    assert.equal(listed.settings.dayDiscussionTime, 90)
    assert.deepEqual(listed.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
})

test('AC-03 · 공개 목록 요약에는 코드·신원·준비 상태·보존 플래그가 들어가지 않는다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoom(io, 'host-a', { accessType: 'code' })
    await joinRoom(io, room.roomCode, 'p1')

    const list = await callAsPromise(handleGetPublicRooms)
    const listed = list.rooms.find((r) => r.id === room.roomId)
    const serialized = JSON.stringify(listed)

    for (const forbidden of ['roomCode', 'hostUuid', 'players', 'isReady', 'code']) {
        assert.equal(Object.hasOwn(listed, forbidden), false, `${forbidden}가 공개 목록에 노출됐다`)
    }
    assert.equal(serialized.includes(room.roomCode), false, '실제 입장 코드가 목록에 새어 나갔다')
    for (const preserved of ['lightsOut', 'soulBetting', 'voteReveal']) {
        assert.equal(Object.hasOwn(listed.settings, preserved), false, `${preserved}는 목록 요약 대상이 아니다`)
    }
})

test('AC-03 · custom→auto 전환은 저장에서 roleCounts를 제거한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', {
        maxPlayers: 8, jokerCount: 1, roleCompositionMode: 'custom',
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    })

    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, {
        maxPlayers: 8, jokerCount: 2, roleCompositionMode: 'auto',
    }))
    assert.equal(res.ok, true, res.message)

    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(Object.hasOwn(stored.settings, 'roleCounts'), false)
    assert.equal(stored.settings.roleCompositionMode, 'auto')

    const current = await callAsPromise(handleGetCurrentRoom, 'host-a')
    assert.equal(Object.hasOwn(current.room.settings, 'roleCounts'), false)
})

test('AC-03 · 잘못된 값(특수직업 3명·역할 합 초과·광대 불일치·비정수 시간·알 수 없는 키)은 저장·방송 없이 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    const invalidPayloads = [
        { roleCompositionMode: 'custom', jokerCount: 1, roleCounts: { JOKER: 1, DOCTOR: 3, GUARD: 0, WITCH_HUNTER: 0 } },
        { maxPlayers: 4, roleCompositionMode: 'custom', jokerCount: 2, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } },
        { roleCompositionMode: 'custom', jokerCount: 2, roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
        { roleCompositionMode: 'auto', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
        { dayDiscussionTime: 45 },
        { dayVoteTime: '60' },
        { nightActionTime: 90.5 },
        { roleNightActionTimes: { CITIZEN: 60 } },
        { roleCompositionMode: 'custom', jokerCount: 1, roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 3 } },
        { settingsVersion: 9 },
        { hostUuid: 'host-a' },
        { lightsOut: true },
    ]

    for (const overrides of invalidPayloads) {
        const res = await callAsPromise(
            handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, overrides),
        )
        assert.equal(res.ok, false, `거부되지 않은 입력: ${JSON.stringify(overrides)}`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }

    assert.equal(snapshotRooms(), before)
    assert.equal(io.broadcasts.length, broadcastsBefore)
})

test('AC-04 · 실제 설정 변경은 방장 포함 전원의 준비를 해제하고, 같은 설정 재저장은 다시 해제하지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const readyBefore = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].players
    assert.ok(readyBefore.every(([, p]) => p.isReady === true))
    const revisionsBefore = Object.fromEntries(readyBefore.map(([u, p]) => [u, p.readyRevision]))

    const changed = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }),
    )
    assert.equal(changed.ok, true, changed.message)
    assert.equal(changed.settingsVersion, 2)

    const afterChange = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(afterChange.players.every(([, p]) => p.isReady === false), '전원 준비가 해제되지 않았다')
    for (const [u, p] of afterChange.players) {
        assert.equal(p.readyRevision, revisionsBefore[u] + 1, `${u}의 readyRevision이 정확히 1 증가하지 않았다`)
    }

    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room, true, { settingsVersion: 2 }))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, true, { settingsVersion: 2 }))
    const reReady = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].players
    assert.ok(reReady.every(([, p]) => p.isReady === true), '재준비가 반영되지 않았다')
    const revisionsAfterReReady = Object.fromEntries(reReady.map(([u, p]) => [u, p.readyRevision]))

    const broadcastsBefore = io.broadcasts.length
    const roomsBeforeNoop = snapshotRooms()
    const noop = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1, expectedSettingsVersion: 2 }),
    )
    assert.equal(noop.ok, true)
    assert.equal(noop.changed, false)
    assert.equal(noop.settingsVersion, 2)
    assert.equal(io.broadcasts.length, broadcastsBefore, '변경이 없는데 목록 방송이 나갔다')
    assert.equal(snapshotRooms(), roomsBeforeNoop, '변경이 없는 저장이 방 상태를 바꿨다')

    const afterNoop = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(afterNoop.settingsVersion, 2, '변경이 없는데 버전이 올라갔다')
    for (const [u, p] of afterNoop.players) {
        assert.equal(p.isReady, true, `${u}의 준비가 변경 없는 저장으로 해제됐다`)
        assert.equal(p.readyRevision, revisionsAfterReReady[u], `${u}의 readyRevision이 다시 올라갔다`)
    }
})

test('AC-04 · 같은 requestId 재전달은 재커밋 없이 기록된 결과를 돌려주고, 같은 키의 다른 입력은 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const payload = updatePayload(room.roomId, { maxPlayers: 6 })
    const first = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', payload)
    assert.equal(first.ok, true, first.message)
    assert.equal(first.settingsVersion, 2)

    const afterFirst = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    const retry = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', { ...payload })
    assert.equal(retry.ok, true)
    assert.equal(retry.replayed, true)
    assert.equal(retry.changed, true)
    assert.equal(retry.settingsVersion, 2, '재시도가 버전을 다시 올렸다')
    assert.equal(snapshotRooms(), afterFirst)
    assert.equal(io.broadcasts.length, broadcastsBefore)

    const reused = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', { ...payload, maxPlayers: 10 },
    )
    assert.equal(reused.ok, false)
    assert.equal(reused.code, ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED)
    assert.equal(snapshotRooms(), afterFirst)
})

test('AC-04 · 같은 requestId를 다른 기대 버전으로 다시 보내면 같은 요청이 아니므로 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const requestId = 'req-version-reuse'
    const first = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))
    assert.equal(first.ok, true, first.message)
    assert.equal(first.settingsVersion, 2)

    const afterFirst = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    const differentVersion = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6, expectedSettingsVersion: 2 }))
    assert.equal(differentVersion.ok, false, '기대 버전이 다른 재전달이 멱등 재시도로 처리됐다')
    assert.equal(differentVersion.code, ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED)
    assert.equal(differentVersion.settingsVersion, undefined)

    const trueRetry = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))
    assert.equal(trueRetry.ok, true, trueRetry.message)
    assert.equal(trueRetry.replayed, true)
    assert.equal(trueRetry.settingsVersion, 2)

    assert.equal(snapshotRooms(), afterFirst, '재전달이 방 상태를 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsBefore, '재전달이 방송을 다시 냈다')
})

test('AC-05 · 결과 기록은 삽입 시점에도 상한을 지키고, 가장 오래된 기록부터 버린다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const results = () => matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults
    const MAX = 500

    for (let i = 0; i < MAX; i += 1) {
        const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
            updatePayload(room.roomId, { requestId: `cap-${i}` }))
        assert.equal(res.ok, true, res.message)
    }
    assert.equal(results().length, MAX)
    const oldestKeyBefore = results()[0][0]

    const overflow = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId: 'cap-overflow' }))
    assert.equal(overflow.ok, true, overflow.message)
    assert.equal(results().length, MAX, '삽입 시점에 상한이 집행되지 않았다')

    const keysAfter = results().map(([key]) => key)
    assert.equal(keysAfter.includes(oldestKeyBefore), false, '가장 오래된 기록이 남았다')
    const lookupNew = await callAsPromise(handleGetRoomSettingsUpdateResult, 'host-a',
        { roomId: room.roomId, requestId: 'cap-overflow' })
    assert.notEqual(lookupNew.status, 'UNKNOWN', '방금 넣은 기록이 대신 버려졌다')
    const lookupOld = await callAsPromise(handleGetRoomSettingsUpdateResult, 'host-a',
        { roomId: room.roomId, requestId: 'cap-0' })
    assert.equal(lookupOld.status, 'UNKNOWN')
})

test('AC-05 · 미확정 입장 되돌림으로 방이 비어 사라져도 그 방의 결과 기록은 함께 사라진다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const guestSocket = await joinRoom(io, room.roomCode, 'guest')

    const requestId = 'req-unpublish-room-gone'
    const saved = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))
    assert.equal(saved.ok, true, saved.message)
    assert.equal(matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 1)

    matchmaking.__seedAdmissionAttemptForTests('guest', {
        roomId: room.roomId, phase: 'published', socketId: guestSocket.id,
    })
    matchmaking.__testables.removeFromRoom(io, hostSocket, 'host-a')
    assert.equal(
        matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 1,
        '방이 아직 살아 있는데 기록이 사라졌다',
    )

    matchmaking.onDisconnect(io, guestSocket, 'guest')
    assert.equal(
        matchmaking.__getStateSnapshotForTests().gameRooms.length, 0,
        '미확정 소속 되돌림이 빈 방을 정리하지 않았다(전제가 깨졌다)',
    )
    assert.equal(
        matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 0,
        '방이 사라졌는데 그 방의 결과 기록이 남았다',
    )

    const lookup = await callAsPromise(handleGetRoomSettingsUpdateResult, 'host-a',
        { roomId: room.roomId, requestId })
    assert.equal(lookup.status, 'UNKNOWN')
    assert.equal(lookup.room, null)
})

test('AC-04 · 같은 버전으로 들어온 두 저장은 하나만 성공하고 나머지는 충돌이다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const first = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { expectedSettingsVersion: 1, maxPlayers: 6 }),
    )
    const second = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { expectedSettingsVersion: 1, maxPlayers: 10 }),
    )

    assert.equal(first.ok, true)
    assert.equal(second.ok, false)
    assert.equal(second.code, ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT)
    assert.equal(second.room.settingsVersion, 2)
    assert.equal(second.room.settings.maxPlayers, 6)
})

test('AC-04 · 값이 우연히 현재와 같더라도 기대 버전이 틀리면 충돌로 처리한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { expectedSettingsVersion: 1, maxPlayers: 6 }))

    const stale = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { expectedSettingsVersion: 1, maxPlayers: 6 }))
    assert.equal(stale.ok, false)
    assert.equal(stale.code, ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT)
})

test('AC-04 · 시작 요청이 외형 조회 중일 때 설정이 저장되면 그 시작은 실패하고 게임이 만들어지지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    startLoadoutGate = createStartGate()

    const startPromise = new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    await startLoadoutGate.entered

    const saved = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }),
    )
    assert.equal(saved.ok, true, saved.message)
    assert.equal(saved.settingsVersion, 2)

    const afterSave = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(afterSave.players.every(([, p]) => p.isReady === false), '저장이 준비를 해제하지 않았다')

    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room, true, { settingsVersion: 2 }))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, true, { settingsVersion: 2 }))

    startLoadoutGate.release()
    const startResult = await startPromise
    assert.equal(startResult.ok, false, '옛 설정으로 시작된 요청이 성공했다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null, '게임 세션이 만들어졌다')
    assert.ok(gameRoomStillExists(room.roomId), '실패한 시작이 방을 없앴다')

    startLoadoutGate = null
    const restarted = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room, { settingsVersion: 2 }), resolve))
    assert.equal(restarted.ok, true, restarted.message)
})

function gameRoomStillExists(roomId) {
    return matchmaking.__getStateSnapshotForTests().gameRooms.some(([id]) => id === roomId)
}

test('AC-04 · 외형 조회 중 참가자가 나갔다가 같은 방에 다시 들어와 준비해도 옛 시작은 실패한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    startLoadoutGate = createStartGate()
    const startPromise = new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    await startLoadoutGate.entered

    matchmaking.__testables.removeFromRoom(io, joinerSocket, 'p1')
    const rejoined = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, rejoined, 'p1', readyPayload(room))
    const beforeRelease = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.deepEqual(beforeRelease.players.map(([u]) => u).sort(), ['host-a', 'p1'])
    assert.ok(beforeRelease.players.every(([, p]) => p.isReady === true))
    assert.equal(beforeRelease.settingsVersion ?? 1, 1, '이 사건은 설정 변경 없이 성립해야 한다')

    startLoadoutGate.release()
    const startResult = await startPromise
    assert.equal(startResult.ok, false, '이탈·재입장 사이에 걸쳐 있던 옛 시작이 커밋됐다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.ok(gameRoomStillExists(room.roomId), '실패한 시작이 방을 없앴다')

    startLoadoutGate = null
    const restarted = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(restarted.ok, true, restarted.message)
})

test('AC-04 · 외형 조회 중 canonical 소켓이 교체되면 옛 소켓이 연결돼 있어도 시작이 커밋되지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    let canonicalHostSocketId = hostSocket.id
    matchmaking.registerMatchmakingHandlers(io, hostSocket, 'host-a', {
        getCurrentSocketId: (u) => (u === 'host-a' ? canonicalHostSocketId : `sock-${u}`),
    })

    startLoadoutGate = createStartGate()
    const startPromise = new Promise((resolve) =>
        hostSocket.trigger('start_game', startPayload(room), resolve))
    await startLoadoutGate.entered

    const replacement = createFakeSocket('host-a', { id: 'sock-host-a-2' })
    io.sockets.sockets.set(replacement.id, replacement)
    await replacement.join(room.roomId)
    canonicalHostSocketId = replacement.id
    assert.equal(hostSocket.connected, true, '이 사건의 전제는 옛 소켓이 아직 연결돼 있다는 것이다')

    startLoadoutGate.release()
    const startResult = await startPromise
    assert.equal(startResult.ok, false, '교체된 옛 소켓의 시작이 커밋됐다')
    assert.equal(startResult.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.ok(gameRoomStillExists(room.roomId))

    startLoadoutGate = null
    const byCurrent = await new Promise((resolve) =>
        handleStartGame(io, replacement, 'host-a', startPayload(room), resolve,
            (u) => (u === 'host-a' ? canonicalHostSocketId : `sock-${u}`)))
    assert.equal(byCurrent.ok, true, byCurrent.message)
})

test('AC-04 · 내부 검사 통과 뒤·바깥 재개 전에 준비가 취소되면 그 시작은 커밋되지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    let innerCheckPassed = false
    let cancelAck = null
    onStartLoadoutsRead = () => {
        innerCheckPassed = true
        Promise.resolve().then(() => {
            handleSetReady(io, joinerSocket, 'p1', readyPayload(room, false), (res) => { cancelAck = res })
        })
    }

    const startResult = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))

    assert.equal(innerCheckPassed, true,
        '내부 검사가 통과하기 전에 준비가 취소됐다 — 재현하려던 창이 아니다')
    assert.equal(cancelAck?.ok, true, '준비 취소 자체가 성립하지 않았다(전제가 깨졌다)')

    assert.equal(startResult.ok, false, '준비가 취소된 뒤에도 시작이 커밋됐다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null, '게임 세션이 만들어졌다')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('p1'), null)
    assert.ok(gameRoomStillExists(room.roomId), '실패한 시작이 방을 없앴다')

    const afterFailure = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(afterFailure.settingsVersion ?? 1, 1, '이 사건은 설정 버전 변화 없이 성립해야 한다')
    assert.equal(afterFailure.players.find(([u]) => u === 'p1')[1].isReady, false,
        '실패한 시작이 취소된 준비를 되돌렸다')

    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))
    const restarted = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(restarted.ok, true, restarted.message)
})

async function setupReadyPairForStart(io) {
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))
    return { hostSocket, joinerSocket, room }
}

function startWithAckCount(io, socket, uuid, payload, getCurrentSocketId) {
    const state = { acks: 0, response: null }
    state.promise = new Promise((resolve) => {
        handleStartGame(io, socket, uuid, payload, (res) => {
            state.acks += 1
            state.response = res
            resolve(res)
        }, getCurrentSocketId)
    })
    return state
}

const gameStartedCount = (socket) => socket.emitted.filter((e) => e.event === 'game_started').length

test('CO S-1 · 전적 조회 대기 중 설정이 저장되면 그 시작은 커밋되지 않고 방과 세션이 그대로다', async () => {
    const io = createFakeIo([])
    const { hostSocket, joinerSocket, room } = await setupReadyPairForStart(io)

    recordSummaryGate = createStartGate()
    const start = startWithAckCount(io, hostSocket, 'host-a', startPayload(room))
    await recordSummaryGate.entered
    assert.equal(recordSummaryCalls, 1, '시작 요청이 실제로 전적 조회 대기에 들어가야 이 사건이 성립한다')

    const saved = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }),
    )
    assert.equal(saved.ok, true, saved.message)

    recordSummaryGate.release()
    const startResult = await start.promise
    assert.equal(startResult.ok, false, '옛 설정으로 시작된 요청이 전적 조회 경계를 우회해 커밋됐다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(start.acks, 1, 'ack는 정확히 한 번이어야 한다')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null, '세션이 커밋되면 안 된다')
    assert.equal(gameStartedCount(hostSocket) + gameStartedCount(joinerSocket), 0)
    assert.ok(gameRoomStillExists(room.roomId), '실패한 시작이 방을 없앴다')
    const after = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(after.settings.maxPlayers, 6, '저장된 새 설정이 실패한 시작 때문에 되돌려지면 안 된다')
})

test('CO S-1 · 전적 조회 대기 중 방이 사라지면 그 시작은 커밋되지 않고 방이 되살아나지도 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, joinerSocket, room } = await setupReadyPairForStart(io)

    recordSummaryGate = createStartGate()
    const start = startWithAckCount(io, hostSocket, 'host-a', startPayload(room))
    await recordSummaryGate.entered

    matchmaking.__removeRoomForTests(room.roomId)

    recordSummaryGate.release()
    const startResult = await start.promise
    assert.equal(startResult.ok, false, '이미 사라진 방의 시작이 커밋됐다')
    assert.equal(start.acks, 1)
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.equal(gameStartedCount(hostSocket) + gameStartedCount(joinerSocket), 0)
    assert.equal(gameRoomStillExists(room.roomId), false, '실패한 시작이 사라진 방을 되살렸다')
})

test('CO S-1 · 전적 조회 대기 중 준비가 취소되면 그 시작은 커밋되지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, joinerSocket, room } = await setupReadyPairForStart(io)

    recordSummaryGate = createStartGate()
    const start = startWithAckCount(io, hostSocket, 'host-a', startPayload(room))
    await recordSummaryGate.entered

    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, false))

    recordSummaryGate.release()
    const startResult = await start.promise
    assert.equal(startResult.ok, false)
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(start.acks, 1)
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.equal(gameStartedCount(hostSocket) + gameStartedCount(joinerSocket), 0)
    assert.ok(gameRoomStillExists(room.roomId))
})

test('CO S-1 · 전적 조회 대기 중 참가자가 나갔다가 다시 들어와 준비해도 옛 시작은 실패한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, joinerSocket, room } = await setupReadyPairForStart(io)

    recordSummaryGate = createStartGate()
    const start = startWithAckCount(io, hostSocket, 'host-a', startPayload(room))
    await recordSummaryGate.entered

    matchmaking.__testables.removeFromRoom(io, joinerSocket, 'p1')
    const rejoined = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, rejoined, 'p1', readyPayload(room))

    recordSummaryGate.release()
    const startResult = await start.promise
    assert.equal(startResult.ok, false, '이탈·재입장 사이에 걸쳐 있던 옛 시작이 커밋됐다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(start.acks, 1)
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.equal(gameStartedCount(hostSocket) + gameStartedCount(rejoined), 0)
    assert.ok(gameRoomStillExists(room.roomId))
})

test('CO S-1 · 전적 조회 대기 중 canonical 소켓이 교체되면 옛 소켓의 시작은 커밋되지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await setupReadyPairForStart(io)

    let canonicalHostSocketId = hostSocket.id
    const getCurrentSocketId = (u) => (u === 'host-a' ? canonicalHostSocketId : `sock-${u}`)

    recordSummaryGate = createStartGate()
    const start = startWithAckCount(io, hostSocket, 'host-a', startPayload(room), getCurrentSocketId)
    await recordSummaryGate.entered

    const replacement = createFakeSocket('host-a', { id: 'sock-host-a-2' })
    io.sockets.sockets.set(replacement.id, replacement)
    await replacement.join(room.roomId)
    canonicalHostSocketId = replacement.id
    assert.equal(hostSocket.connected, true, '이 사건의 전제는 옛 소켓이 아직 연결돼 있다는 것이다')

    recordSummaryGate.release()
    const startResult = await start.promise
    assert.equal(startResult.ok, false, '교체된 옛 소켓의 시작이 전적 조회 경계를 우회해 커밋됐다')
    assert.equal(startResult.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(start.acks, 1)
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.ok(gameRoomStillExists(room.roomId))

    recordSummaryGate = null
    const byCurrent = await new Promise((resolve) =>
        handleStartGame(io, replacement, 'host-a', startPayload(room), resolve, getCurrentSocketId))
    assert.equal(byCurrent.ok, true, byCurrent.message)
})

test('CO S-1 · 전적 조회가 실패해도 최종 가드는 그대로 걸리고, 상태가 그대로면 전적 없이 시작된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, joinerSocket, room } = await setupReadyPairForStart(io)

    recordSummaryShouldReject = true
    recordSummaryGate = createStartGate()
    const start = startWithAckCount(io, hostSocket, 'host-a', startPayload(room))
    await recordSummaryGate.entered
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, false))
    recordSummaryGate.release()

    const startResult = await start.promise
    assert.equal(startResult.ok, false, '전적 조회 실패가 방 상태 검사를 건너뛰게 만들었다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(start.acks, 1)
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.equal(gameStartedCount(hostSocket) + gameStartedCount(joinerSocket), 0)

    recordSummaryGate = null
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, true))
    const restarted = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(restarted.ok, true, restarted.message)
    const startedPayload = hostSocket.emitted.find((e) => e.event === 'game_started').payload
    for (const player of startedPayload.state.players) {
        assert.equal(Object.hasOwn(player, 'accountTotalGames'), false)
        assert.equal(Object.hasOwn(player, 'accountWinRate'), false)
    }
})

test('AC-04 · 게임이 먼저 시작되면 이후 설정 저장은 거부되고 시작된 판의 설정은 그대로다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', {
        maxPlayers: 4, jokerCount: 1, dayDiscussionTime: 60, nightActionTime: 90,
    })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const started = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(started.ok, true, started.message)

    const rejected = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, dayDiscussionTime: 150 }),
    )
    assert.equal(rejected.ok, false)
    assert.equal(rejected.code, ROOM_SETTINGS_ERROR_CODES.ALREADY_IN_GAME)
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a')?.gameId, started.gameId)
})

test('AC-05 · 세션이 만들어진 뒤 대기방 설정 객체를 바꿔도 그 판의 역할·제한시간은 소급 변경되지 않는다', async () => {
    const room = {
        id: 'room-immutable',
        players: new Map([
            ['u1', { uuid: 'u1', nickname: 'n1', isReady: true }],
            ['u2', { uuid: 'u2', nickname: 'n2', isReady: true }],
            ['u3', { uuid: 'u3', nickname: 'n3', isReady: true }],
            ['u4', { uuid: 'u4', nickname: 'n4', isReady: true }],
        ]),
        settings: {
            maxPlayers: 4,
            jokerCount: 1,
            roleCompositionMode: 'custom',
            roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
            dayDiscussionTime: 60,
            dayVoteTime: 60,
            nightActionTime: 90,
            roleNightActionTimes: { JOKER: 30 },
        },
    }

    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    assert.equal(candidate.ok, true, candidate.reason)
    const { session } = candidate

    const rolesBefore = JSON.stringify([...session.players.values()].map((p) => [p.uuid, p.role]).sort())
    const timersBefore = JSON.stringify(session.timerSettings)

    room.settings.dayDiscussionTime = 150
    room.settings.roleNightActionTimes.JOKER = 120
    room.settings.roleCounts.DOCTOR = 2
    room.settings = { maxPlayers: 10, jokerCount: 2, dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30 }

    assert.equal(JSON.stringify([...session.players.values()].map((p) => [p.uuid, p.role]).sort()), rolesBefore)
    assert.equal(JSON.stringify(session.timerSettings), timersBefore)
    assert.equal(session.timerSettings.dayDiscussionTime, 60)
    assert.equal(session.timerSettings.roleNightActionTimes.JOKER, 30)
})

test('AC-04 · 설정 변경 뒤에 도착한 옛 버전의 준비 요청은 해제 스냅샷을 되돌리지 못한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }))

    const late = await callAsPromise(handleSetReady, io, joinerSocket, 'p1', {
        isReady: true, roomId: room.roomId, expectedSettingsVersion: 1,
    })
    assert.equal(late.ok, false)
    assert.equal(late.code, ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT)
    assert.equal(late.settingsVersion, 2)

    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(stored.players.every(([, p]) => p.isReady === false))

    const fresh = await callAsPromise(handleSetReady, io, joinerSocket, 'p1', {
        isReady: true, roomId: room.roomId, expectedSettingsVersion: 2,
    })
    assert.equal(fresh.ok, true)
    assert.equal(fresh.settingsVersion, 2)
    assert.equal(fresh.roomId, room.roomId)
    assert.equal(typeof fresh.readyRevision, 'number')
})

test('AC-04 · 방·설정 버전이 빠졌거나 형태가 틀린 준비/시작 요청은 거부되고 서버가 현재 값으로 채워 주지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    const badReady = [
        { isReady: true },
        { isReady: true, roomId: room.roomId },
        { isReady: true, expectedSettingsVersion: 1 },
        { isReady: true, roomId: '', expectedSettingsVersion: 1 },
        { isReady: true, roomId: room.roomId, expectedSettingsVersion: 0 },
        { isReady: true, roomId: room.roomId, expectedSettingsVersion: '1' },
        { isReady: true, roomId: room.roomId, expectedSettingsVersion: 1.5 },
    ]
    for (const payload of badReady) {
        const res = await callAsPromise(handleSetReady, io, hostSocket, 'host-a', payload)
        assert.equal(res.ok, false, `거부되지 않은 준비 요청: ${JSON.stringify(payload)}`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }
    const afterBadReady = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(afterBadReady.players.every(([, p]) => p.isReady === false), '거부된 요청이 준비 상태를 바꿨다')

    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const badStart = [
        undefined, null, 'not-an-object', ['roomId'],
        {},
        { roomId: room.roomId },
        { expectedSettingsVersion: 1 },
        { roomId: room.roomId, expectedSettingsVersion: 0 },
        { roomId: room.roomId, expectedSettingsVersion: '1' },
    ]
    for (const payload of badStart) {
        const res = await new Promise((resolve) => handleStartGame(io, hostSocket, 'host-a', payload, resolve))
        assert.equal(res.ok, false, `거부되지 않은 시작 요청: ${JSON.stringify(payload)}`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }
    assert.equal(startLoadoutCalls, 0, '형태가 틀린 시작 요청이 외형 조회까지 들어갔다')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null, '게임이 만들어졌다')
    assert.ok(gameRoomStillExists(room.roomId), '거부된 시작이 방을 없앴다')

    const otherRoom = await new Promise((resolve) => handleStartGame(
        io, hostSocket, 'host-a', { roomId: 'some-other-room', expectedSettingsVersion: 1 }, resolve))
    assert.equal(otherRoom.ok, false)
    assert.equal(otherRoom.code, 'ROOM_NOT_FOUND')

    const started = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(started.ok, true, started.message)
})

test('AC-04 · 옛 설정 버전을 들고 온 시작 요청은 비동기 선행 작업에 들어가기 전에 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }))
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room, true, { settingsVersion: 2 }))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, true, { settingsVersion: 2 }))

    startLoadoutCalls = 0
    const stale = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room, { settingsVersion: 1 }), resolve))
    assert.equal(stale.ok, false, '옛 버전을 근거로 한 시작이 성공했다')
    assert.equal(stale.code, 'ROOM_STATE_CHANGED')
    assert.equal(stale.settingsVersion, 2, '충돌 응답이 현재 버전을 알려주지 않았다')
    assert.equal(startLoadoutCalls, 0, '이미 지난 버전의 요청이 외형 조회 비용을 썼다')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)

    const fresh = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room, { settingsVersion: 2 }), resolve))
    assert.equal(fresh.ok, true, fresh.message)
    assert.equal(startLoadoutCalls, 1)
})

test('AC-04 · 실제 이벤트 등록부가 set_ready·start_game payload를 핸들러까지 전달한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    matchmaking.registerMatchmakingHandlers(io, hostSocket, 'host-a')

    const readyNoVersion = await new Promise((resolve) =>
        hostSocket.trigger('set_ready', { isReady: true }, resolve))
    assert.equal(readyNoVersion.ok, false, '등록부가 방·버전 없는 준비 요청을 통과시켰다')
    assert.equal(readyNoVersion.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)

    const readyOk = await new Promise((resolve) =>
        hostSocket.trigger('set_ready', readyPayload(room), resolve))
    assert.equal(readyOk.ok, true, readyOk.message)
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const staleStart = await new Promise((resolve) =>
        hostSocket.trigger('start_game', { roomId: room.roomId, expectedSettingsVersion: 99 }, resolve))
    assert.equal(staleStart.ok, false, '등록부가 payload를 버려 옛 버전 시작이 통과했다')
    assert.equal(staleStart.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)

    const startedViaWire = await new Promise((resolve) =>
        hostSocket.trigger('start_game', startPayload(room), resolve))
    assert.equal(startedViaWire.ok, true, startedViaWire.message)
})

test('AC-05 · 재접속 재조회는 최신 서버 설정을 돌려주고, 방장이 바뀌어도 같은 설정을 본다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { accessType: 'code', maxPlayers: 6, dayDiscussionTime: 120 }))

    const rejoinSocket = createFakeSocket('p1', { id: 'sock-p1-new' })
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket)
    await matchmaking.resyncRoomChannelOnReconnect(rejoinSocket, 'p1')
    const restored = await callAsPromise(handleGetCurrentRoom, 'p1')
    assert.equal(restored.room.settingsVersion, 2)
    assert.equal(restored.room.accessType, 'code')
    assert.equal(restored.room.settings.dayDiscussionTime, 120)

    const before = io.broadcasts.length
    matchmaking.onDisconnect(io, hostSocket, 'host-a')
    matchmaking.__flushRoomRetentionForTests()

    const hostChanged = io.broadcasts.slice(before).filter((b) => b.event === 'host_changed')
    assert.equal(hostChanged.length, 1)
    assert.equal(hostChanged[0].payload.hostUuid, 'p1')
    assert.equal(hostChanged[0].payload.settingsVersion, 2)

    const asNewHost = await callAsPromise(handleGetCurrentRoom, 'p1')
    assert.equal(asNewHost.room.hostUuid, 'p1')
    assert.equal(asNewHost.room.settingsVersion, 2)
    assert.equal(asNewHost.room.settings.dayDiscussionTime, 120)
})

test('AC-05 · 결과 조회의 식별자 계약은 저장 요청과 같다(공백만·과길이는 기록을 읽기 전에 거부된다)', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const requestId = 'req-shared-contract'
    const saved = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }),
    )
    assert.equal(saved.ok, true, saved.message)

    const tooLong = 'x'.repeat(MAX_IDENTIFIER_LENGTH + 1)
    const invalidCases = [
        { roomId: '   ', requestId, label: '공백만 있는 roomId' },
        { roomId: room.roomId, requestId: '\t\n ', label: '공백만 있는 requestId' },
        { roomId: tooLong, requestId, label: '길이 상한을 넘는 roomId' },
        { roomId: room.roomId, requestId: tooLong, label: '길이 상한을 넘는 requestId' },
    ]

    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length
    for (const { roomId, requestId: rid, label } of invalidCases) {
        const asSave = await callAsPromise(
            handleUpdateRoomSettings, io, hostSocket, 'host-a',
            updatePayload(room.roomId, { roomId, requestId: rid, expectedSettingsVersion: 2 }),
        )
        assert.equal(asSave.ok, false, `${label}: 저장 경로가 받아들였다(전제가 깨졌다)`)
        assert.equal(asSave.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)

        const asQuery = await callAsPromise(
            handleGetRoomSettingsUpdateResult, 'host-a', { roomId, requestId: rid },
        )
        assert.equal(asQuery.ok, false, `${label}: 조회 경로가 정상 응답을 돌려줬다`)
        assert.equal(asQuery.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, label)
        assert.equal(asQuery.status, undefined, `${label}: 거부가 기록 상태를 노출했다`)
        assert.equal(asQuery.room, undefined, `${label}: 거부가 방 상태를 노출했다`)
    }
    assert.equal(snapshotRooms(), before, '거부된 조회가 방 상태를 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsBefore, '거부된 조회가 방송을 냈다')

    const longButValid = 'r'.repeat(MAX_IDENTIFIER_LENGTH)
    const savedLong = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId: longButValid, expectedSettingsVersion: 2, maxPlayers: 5 }),
    )
    assert.equal(savedLong.ok, true, savedLong.message)
    const lookupLong = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId: longButValid },
    )
    assert.equal(lookupLong.ok, true)
    assert.equal(lookupLong.status, 'APPLIED')
    assert.equal(lookupLong.requestId, longButValid, '유효한 식별자가 그대로 보존되지 않았다')

    const unknown = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId: 'never-sent' },
    )
    assert.equal(unknown.ok, true)
    assert.equal(unknown.status, 'UNKNOWN')
})

test('AC-05 · ACK를 잃은 원 요청자는 같은 requestId 조회로 적용 여부를 확인하고, 타 계정 조회는 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    const requestId = 'req-lost-ack'
    handleUpdateRoomSettings(io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }),
        () => { throw new Error('ack 유실(테스트 주입)') })

    const lookup = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId },
    )
    assert.equal(lookup.ok, true)
    assert.equal(lookup.status, 'APPLIED')
    assert.equal(lookup.settingsVersion, 2)
    assert.equal(lookup.room.settingsVersion, 2)

    const otherAccount = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'p1', { roomId: room.roomId, requestId },
    )
    assert.equal(otherAccount.status, 'UNKNOWN')
    assert.ok(joinerSocket)

    const unknown = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId: 'never-sent' },
    )
    assert.equal(unknown.status, 'UNKNOWN')
    assert.equal(unknown.settingsVersion, undefined)
})

test('AC-05 · 결과 조회는 현재 소속을 스스로 검증하며, 방을 떠난 뒤에는 room을 주지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    await joinRoom(io, room.roomCode, 'p1')

    const requestId = 'req-left-room'
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))

    matchmaking.onDisconnect(io, hostSocket, 'host-a')
    matchmaking.__flushRoomRetentionForTests()

    const lookup = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId },
    )
    assert.equal(lookup.status, 'APPLIED', '적용 사실 자체는 여전히 알려줘야 한다')
    assert.equal(lookup.room, null, '더 이상 참가자가 아닌 계정에 방 상태를 줬다')
})

test('AC-05 · 방이 사라지면 그 방의 설정 변경 결과 기록도 함께 사라진다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const requestId = 'req-room-gone'
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))
    assert.equal(matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 1)

    matchmaking.__testables.handleDeleteRoom(io, 'host-a')
    assert.equal(matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 0)

    const lookup = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId },
    )
    assert.equal(lookup.status, 'UNKNOWN')
})

test('AC-06 · 관전자 키는 수정 요청에서 거부되고, 예전 저장값에 섞여 있어도 응답으로 되살아나지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    await joinRoom(io, room.roomCode, 'p1')

    for (const spectatorKey of ['allowSpectators', 'allow-spectators', 'spectator', 'spectatorMode']) {
        const res = await callAsPromise(
            handleUpdateRoomSettings, io, hostSocket, 'host-a',
            { ...updatePayload(room.roomId), [spectatorKey]: true },
        )
        assert.equal(res.ok, false, `${spectatorKey}가 거부되지 않았다`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }

    const legacy = rawRoom(room.roomId)
    legacy.settings = { ...legacy.settings, allowSpectators: true, unknownLegacyKey: 'x' }
    matchmaking.__seedRoomForTests(legacy)

    const current = await callAsPromise(handleGetCurrentRoom, 'p1')
    assert.equal(Object.hasOwn(current.room.settings, 'allowSpectators'), false)
    assert.equal(Object.hasOwn(current.room.settings, 'unknownLegacyKey'), false)
    assertNoSpectatorKeys(current.room, '오염된 저장값의 현재 방 조회 응답')

    const list = await callAsPromise(handleGetPublicRooms)
    assertNoSpectatorKeys(list.rooms, '오염된 저장값의 공개 목록 응답')

    const saved = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6 }),
    )
    assert.equal(saved.ok, true, saved.message)
    const storedSettings = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    assertNoSpectatorKeys(storedSettings, '정상 저장 뒤 서버 저장값')
    assert.equal(Object.hasOwn(storedSettings, 'unknownLegacyKey'), false)
    assert.equal(storedSettings.lightsOut, false)
    assert.equal(storedSettings.soulBetting, false)
    assert.equal(storedSettings.voteReveal, true)
})

function rawRoom(roomId) {
    const snapshot = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === roomId)
    const room = snapshot[1]
    return { ...room, players: new Map(room.players) }
}

test('AC-06 · 값이 달라지지 않는 저장도 저장값의 관전자 키를 걷어내고, 버전·준비·방송은 그대로다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    const toCustom = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, {
            roleCompositionMode: 'custom',
            roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
            roleNightActionTimes: { JOKER: 30 },
        }),
    )
    assert.equal(toCustom.ok, true, toCustom.message)
    assert.equal(toCustom.changed, true, '전제: CUSTOM 전환은 실제 변경이어야 한다')

    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room, true, { settingsVersion: 2 }))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, true, { settingsVersion: 2 }))

    const legacy = rawRoom(room.roomId)
    legacy.settings = {
        ...legacy.settings,
        allowSpectators: true,
        'allow-spectators': true,
        spectator: 'x',
        spectatorMode: 'all',
        SPECTATOR: true,
        roleCounts: { ...(legacy.settings.roleCounts ?? {}), SPECTATOR: 1 },
        roleNightActionTimes: { ...(legacy.settings.roleNightActionTimes ?? {}), SPECTATOR: 30 },
    }
    matchmaking.__seedRoomForTests(legacy)

    const storedBefore = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    const seeded = findSpectatorKeys(storedBefore)
    assert.ok(seeded.includes('$.allowSpectators'), '이 시험의 전제는 오염된 저장값이다')
    assert.ok(seeded.includes('$.roleCounts.SPECTATOR'), '전제: 중첩 roleCounts 오염이 심어져야 한다')
    assert.ok(seeded.includes('$.roleNightActionTimes.SPECTATOR'), '전제: 중첩 밤 시간 오염이 심어져야 한다')

    const readyBefore = [...matchmaking.__getStateSnapshotForTests().gameRooms[0][1].players]
        .map(([uuid, p]) => [uuid, p.isReady, p.readyRevision])
    assert.ok(readyBefore.every(([, isReady]) => isReady === true), '전제: 전원이 준비 상태여야 한다')
    const broadcastsBefore = io.broadcasts.length
    const deliveredBefore = {
        host: hostSocket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED),
        joiner: joinerSocket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED),
    }

    const res = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, {
            expectedSettingsVersion: 2,
            maxPlayers: 8,
            jokerCount: 2,
            roleCompositionMode: 'custom',
            roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
            roleNightActionTimes: { JOKER: 30 },
        }),
    )
    assert.equal(res.ok, true, res.message)
    assert.equal(res.changed, false, '값이 같은 저장이 변경으로 처리됐다')
    assert.equal(res.settingsVersion, 2)

    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    assertNoSpectatorKeys(stored, '동일값 저장 뒤 서버 저장값')
    assert.equal(Object.hasOwn(stored, 'unknownLegacyKey'), false)
    assert.deepEqual(Object.keys(stored.roleCounts).sort(), [...NORMAL_ROLE_KEYS].sort())
    assert.deepEqual(stored.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
    assert.deepEqual(stored.roleNightActionTimes, { JOKER: 30 })
    assert.equal(stored.maxPlayers, 8)
    assert.equal(stored.jokerCount, 2)
    assert.equal(stored.dayDiscussionTime, 60)
    assert.equal(stored.dayVoteTime, 60)
    assert.equal(stored.nightActionTime, 90)
    assert.equal(stored.lightsOut, false)
    assert.equal(stored.soulBetting, false)
    assert.equal(stored.voteReveal, true)

    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settingsVersion, 2,
        '정제만으로 설정 버전이 올랐다')
    const readyAfter = [...matchmaking.__getStateSnapshotForTests().gameRooms[0][1].players]
        .map(([uuid, p]) => [uuid, p.isReady, p.readyRevision])
    assert.deepEqual(readyAfter, readyBefore, 'no-change 저장이 준비 상태나 readyRevision을 건드렸다')
    assert.equal(io.broadcasts.length, broadcastsBefore, 'no-change 저장이 방송을 발생시켰다')
    assert.equal(
        hostSocket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED), deliveredBefore.host,
        'no-change 저장이 설정 변경 사건을 방장에게 전달했다',
    )
    assert.equal(
        joinerSocket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED), deliveredBefore.joiner,
        'no-change 저장이 설정 변경 사건을 참가자에게 전달했다',
    )

    const changedRes = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, {
            expectedSettingsVersion: 2,
            maxPlayers: 6,
            jokerCount: 2,
            roleCompositionMode: 'custom',
            roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
            roleNightActionTimes: { JOKER: 30 },
        }),
    )
    assert.equal(changedRes.ok, true, changedRes.message)
    assert.equal(changedRes.changed, true)
    assert.equal(changedRes.settingsVersion, 3, '실제 변경이 버전을 올리지 않았다')

    const afterChange = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(afterChange.players.every(([, p]) => p.isReady !== true), '실제 변경이 준비를 풀지 않았다')
    for (const [uuid, , revisionBefore] of readyBefore) {
        const seated = afterChange.players.find(([id]) => id === uuid)[1]
        assert.equal(seated.readyRevision, revisionBefore + 1, `${uuid}의 readyRevision이 오르지 않았다`)
    }
    for (const [label, socket, before] of [
        ['방장', hostSocket, deliveredBefore.host], ['참가자', joinerSocket, deliveredBefore.joiner],
    ]) {
        assert.equal(
            socket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED), before + 1,
            `실제 변경 저장의 설정 사건이 ${label}에게 전달되지 않았다`,
        )
        const delivered = socket.received
            .filter((e) => e.event === ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED).at(-1)
        assertNoSpectatorKeys(delivered.payload, `${label}에게 실제로 전달된 설정 변경 사건`)
        assert.equal(delivered.payload.settings.maxPlayers, 6)
    }
})

test('AC-06 · 중첩 역할 키에 관전자가 섞인 수정 요청은 거부되고 저장·버전·준비·방송이 불변이다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length
    const deliveredBefore = {
        host: hostSocket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED),
        joiner: joinerSocket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED),
    }

    for (const nested of [
        { roleNightActionTimes: { JOKER: 30, SPECTATOR: 30 } },
        {
            roleCompositionMode: 'custom',
            roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, SPECTATOR: 1 },
        },
    ]) {
        const where = Object.keys(nested).join('+')
        const res = await callAsPromise(
            handleUpdateRoomSettings, io, hostSocket, 'host-a',
            updatePayload(room.roomId, { requestId: `nested-${where}`, ...nested }),
        )
        assert.equal(res.ok, false, `중첩 관전자 키(${where})가 거부되지 않았다`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, where)
    }

    assert.equal(snapshotRooms(), before, '거부된 요청이 저장값을 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsBefore, '거부된 요청이 방송을 냈다')
    assert.equal(hostSocket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED), deliveredBefore.host)
    assert.equal(joinerSocket.countReceived(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED), deliveredBefore.joiner)

    const current = await callAsPromise(handleGetCurrentRoom, 'p1')
    assertNoSpectatorKeys(current.room, '거부 뒤 현재 방 조회 응답')
    const list = await callAsPromise(handleGetPublicRooms)
    assertNoSpectatorKeys(list.rooms, '거부 뒤 공개 목록 응답')
})

test('AC-06 · 오염이 없는 방의 no-change 저장은 저장 객체를 교체하지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const before = snapshotRooms()
    const res = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 8, jokerCount: 2 }),
    )
    assert.equal(res.ok, true, res.message)
    assert.equal(res.changed, false)
    assert.equal(snapshotRooms(), before, '정상 방의 no-change 저장이 저장값을 바꿨다')
})

test('AC-06 · 저장 뒤 입력 객체를 변형해도 서버 저장값은 바뀌지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const payload = updatePayload(room.roomId, {
        maxPlayers: 6,
        jokerCount: 1,
        roleCompositionMode: 'custom',
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
        roleNightActionTimes: { JOKER: 30 },
    })
    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', payload)
    assert.equal(res.ok, true, res.message)

    payload.roleCounts.JOKER = 99
    payload.roleNightActionTimes.JOKER = 9999
    payload.maxPlayers = 10

    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    assert.equal(stored.maxPlayers, 6)
    assert.equal(stored.roleCounts.JOKER, 1)
    assert.equal(stored.roleNightActionTimes.JOKER, 30)

    const current = await callAsPromise(handleGetCurrentRoom, 'host-a')
    current.room.settings.maxPlayers = 10
    current.room.settings.roleCounts.JOKER = 99
    const after = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    assert.equal(after.maxPlayers, 6)
    assert.equal(after.roleCounts.JOKER, 1)
})
