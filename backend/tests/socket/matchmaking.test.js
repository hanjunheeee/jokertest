process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

let fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
let fakeGetPublicProfileLoadouts = async (userIds) =>
    Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]))
let fakeGetGameStartLoadouts = async (userIds) =>
    Object.fromEntries(userIds.map((id) => [id, {
        profilePhotoId: null,
        profileBorderId: null,
        cardFrameId: null,
        skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
    }]))
let fakeGetAccountRecordSummaries = async (userIds) =>
    new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }]))
let fakeGetEmojiPalette = async () => ({ slots: Array(8).fill(null), owned: [] })

const matchmaking = require('../../socket/matchmaking')
matchmaking.__setUserRepositoryForTests({
    findByUuid: (...args) => fakeFindByUuid(...args),
})
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: (...args) => fakeGetPublicProfileLoadouts(...args),
    getGameStartLoadouts: (...args) => fakeGetGameStartLoadouts(...args),
    getEmojiPalette: (...args) => fakeGetEmojiPalette(...args),
})
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: (...args) => fakeGetAccountRecordSummaries(...args),
})
matchmaking.__setGameInviteServiceForTests({
    cancelPendingInvitesForRoom: async () => {},
})
const gameSession = require('../../game-core/gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../../socket/roomJoinErrors')
const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleGetPublicRooms,
    handleJoinPublicRoom,
    handleJoinMatchmaking,
    handleStartGame,
    handleSetReady,
    leaveSocketRoomSafely,
} = matchmaking.__testables

function deferred() {
    let resolve
    const promise = new Promise((res) => { resolve = res })
    return { promise, resolve }
}

const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    readyPayload,
    startPayload,
    countingCallback,
    setupReadyRoomForStart,
} = require('../helpers/matchmakingFixtures')

test.beforeEach(() => {
    matchmaking.__resetStateForTests()
    gameSession.__resetStateForTests()
    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
    fakeGetPublicProfileLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]))
    fakeGetAccountRecordSummaries = async (userIds) =>
        new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }]))
    fakeGetEmojiPalette = async () => ({ slots: Array(8).fill(null), owned: [] })
})

test('create_room: 인증 uuid가 host/player로 쓰이고 payload의 uuid/hostUuid는 무시된다', async () => {
    const socket = createFakeSocket('uuid-A')
    const io = createFakeIo([socket])

    const res = await callAsPromise(
        handleCreateRoom, io, socket, 'uuid-A',
        validSettingsPayload({ uuid: 'attacker', hostUuid: 'attacker' })
    )

    assert.equal(res.ok, true)
    assert.equal(res.room.hostUuid, 'uuid-A')
    assert.deepEqual(res.room.players.map((p) => p.uuid), ['uuid-A'])

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1)
    assert.equal(snapshot.playerRoom[0][0], 'uuid-A')
})

test('create_room: 정상 생성 시 Socket room 가입과 Map 반영이 이루어지고, ack에 내부 필드가 없다', async () => {
    const socket = createFakeSocket('uuid-B')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-B', validSettingsPayload())

    assert.equal(res.ok, true)
    assert.deepEqual(Object.keys(res.room).sort(),
        ['accessType', 'bootEpoch', 'canStart', 'hostUuid', 'players', 'roomCode', 'roomId',
            'roomInstanceId', 'settings', 'settingsVersion'])
    for (const internal of ['id', 'code', 'title', 'status', 'createdAt',
        'generation', 'readyRevision']) {
        assert.equal(Object.hasOwn(res.room, internal), false, `내부 필드 ${internal}가 ack에 실렸다`)
    }
    assert.deepEqual(Object.keys(res.room.settings).sort(),
        ['dayDiscussionTime', 'dayVoteTime', 'jokerCount', 'lightsOut', 'maxPlayers',
            'nightActionTime', 'roleCompositionMode', 'soulBetting', 'voteReveal'])
    assert.equal(JSON.stringify(res.room).includes('pectator'), false, '관전자 필드가 응답에 실렸다')
    assert.equal(res.room.accessType, 'open')
    assert.equal(res.room.settingsVersion, 1)
    assert.equal(socket.joined.length, 1)
    assert.equal(socket.joined[0], res.room.roomId)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    assert.equal(room.title, 'user-uuid-B의 방')
    assert.equal(room.accessType, 'open')
    assert.equal(room.settings.maxPlayers, 8)
})

test('create_room: 방장의 서버 공개 프로필(사진·테두리)이 room.players 항목에 실린다', async () => {
    fakeGetPublicProfileLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: 'player-profile-기사', profileBorderId: 'profile-border-귀족' }]))

    const socket = createFakeSocket('uuid-profile-create')
    const io = createFakeIo([socket])
    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-profile-create', validSettingsPayload())

    assert.equal(res.ok, true)
    const [host] = res.room.players
    assert.equal(host.accountProfilePhotoId, 'player-profile-기사')
    assert.equal(host.accountProfileBorderId, 'profile-border-귀족')
})

test('create_room: 계정 프로필 조회가 실패하면 기본 외형으로 조용히 넘어가지 않고 방 생성 자체가 실패한다', async () => {
    fakeGetPublicProfileLoadouts = async () => { throw new Error('economy 조회 실패(테스트 주입)') }

    const socket = createFakeSocket('uuid-profile-create-fail')
    const io = createFakeIo([socket])
    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-profile-create-fail', validSettingsPayload())

    assert.equal(res.ok, false)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0, '계정 외형을 확보하지 못했으면 방이 커밋되면 안 된다')
})

test('join_room_by_code: 참가자의 서버 공개 프로필(사진·테두리)이 room.players 항목에 실린다', async () => {
    const hostSocket = createFakeSocket('uuid-profile-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-profile-host', validSettingsPayload())

    fakeGetPublicProfileLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: 'player-profile-드워프', profileBorderId: 'profile-border-남작' }]))

    const joinerSocket = createFakeSocket('uuid-profile-joiner')
    io.sockets.sockets.set(joinerSocket.id, joinerSocket)
    await handleJoinRoomByCode(io, joinerSocket, 'uuid-profile-joiner', created.room.roomCode)

    const joinedPayload = joinerSocket.emitted.find((e) => e.event === 'room_joined').payload
    const joinerEntry = joinedPayload.players.find((p) => p.uuid === 'uuid-profile-joiner')
    assert.equal(joinerEntry.accountProfilePhotoId, 'player-profile-드워프')
    assert.equal(joinerEntry.accountProfileBorderId, 'profile-border-남작')
})

test('create_room: room.players 항목은 알려진 안전한 키만 갖는다(economyService가 잔액 등 여분 필드를 흘려도 새어나가지 않는다)', async () => {
    fakeGetPublicProfileLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [
            id,
            {
                profilePhotoId: 'player-profile-기사',
                profileBorderId: 'profile-border-귀족',
                balanceGold: 999999,
                entitlements: ['secret-item'],
            },
        ]))

    const socket = createFakeSocket('uuid-profile-safe-keys')
    const io = createFakeIo([socket])
    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-profile-safe-keys', validSettingsPayload())

    assert.equal(res.ok, true)
    const [host] = res.room.players
    assert.deepEqual(
        Object.keys(host).sort(),
        ['accountProfileBorderId', 'accountProfilePhotoId', 'isReady', 'membershipId', 'nickname', 'uuid'],
    )
})

test('create_room: callback이 없는 요청은 어떤 상태도 바꾸지 않는다', () => {
    const before = matchmaking.__getStateSnapshotForTests()
    const socket = createFakeSocket('uuid-C')
    const io = createFakeIo([socket])

    handleCreateRoom(io, socket, 'uuid-C', validSettingsPayload(), undefined)

    const after = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(after, before)
})

test('create_room: 동일 사용자의 빠른 더블클릭/동시 요청에서 방이 하나만 생성된다', async () => {
    const socket = createFakeSocket('uuid-D')
    const io = createFakeIo([socket])
    const payload = validSettingsPayload()

    const p1 = callAsPromise(handleCreateRoom, io, socket, 'uuid-D', payload)
    const p2 = callAsPromise(handleCreateRoom, io, socket, 'uuid-D', payload)
    const [r1, r2] = await Promise.all([p1, p2])

    const results = [r1, r2]
    const successes = results.filter((r) => r.ok)
    const failures = results.filter((r) => !r.ok)
    assert.equal(successes.length, 1)
    assert.equal(failures.length, 1)
    assert.match(failures[0].message, /처리 중/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1)
})

test('create_room: 이미 방에 있는 사용자는 거부된다', async () => {
    const socket = createFakeSocket('uuid-E')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-E', validSettingsPayload())

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-E', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /이미 참여 중/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1)
})

test('create_room: 매칭 대기열에 남은 사용자는 자동 제거되지 않고 거부된다', async () => {
    matchmaking.__seedMatchmakingQueueForTests('uuid-F', { uuid: 'uuid-F', nickname: 'x', socketId: 'sock-F' })
    const socket = createFakeSocket('uuid-F')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-F', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /매칭 대기열/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.matchmakingQueue.length, 1)
    assert.equal(snapshot.gameRooms.length, 0)
})

test('create_room: 사용자 조회가 null을 반환하면 실패 응답을 보낸다', async () => {
    fakeFindByUuid = async () => null
    const socket = createFakeSocket('uuid-G')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-G', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /사용자 정보/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.pendingRoomTransitions.length, 0)
})

test('create_room: 사용자 조회가 예외를 던지면 예약이 해제되고 고정 오류 메시지를 응답한다', async () => {
    fakeFindByUuid = async () => { throw new Error('DB 커넥션 실패(내부 상세)') }
    const socket = createFakeSocket('uuid-H')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-H', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.equal(res.message, '방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.')
    assert.ok(!res.message.includes('DB 커넥션'))

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.pendingRoomTransitions.length, 0)

    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
    const retry = await callAsPromise(handleCreateRoom, io, socket, 'uuid-H', validSettingsPayload())
    assert.equal(retry.ok, true)
})

test('create_room: socket.join() 실패 시 gameRooms/playerRoom에 흔적이 남지 않고 재시도가 가능하다', async () => {
    const socket = createFakeSocket('uuid-I', { joinShouldReject: true })
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-I', validSettingsPayload())
    assert.equal(res.ok, false)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
    assert.equal(snapshot.pendingRoomTransitions.length, 0)

    socket.joinShouldReject = false
    const retry = await callAsPromise(handleCreateRoom, io, socket, 'uuid-I', validSettingsPayload())
    assert.equal(retry.ok, true)
})

test('join_room_by_code: 빈 코드/존재하지 않는 방을 거부한다', async () => {
    const socket = createFakeSocket('uuid-J')
    const io = createFakeIo([socket])

    await handleJoinRoomByCode(io, socket, 'uuid-J', '  ')
    assert.match(socket.emitted.at(-1).payload.message, /코드를 입력/)
    assert.equal(socket.emitted.at(-1).payload.code, ROOM_JOIN_ERROR_CODES.CODE_REQUIRED)

    await handleJoinRoomByCode(io, socket, 'uuid-J', 'ZZZZZZ')
    assert.match(socket.emitted.at(-1).payload.message, /일치하는 방이 없습니다/)
    assert.equal(socket.emitted.at(-1).payload.code, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH)
})

function seedCodeRoom({ id, code, hostUuid, players = [hostUuid], maxPlayers = 8 }) {
    const room = {
        id,
        code,
        hostUuid,
        title: `${hostUuid}의 방`,
        accessType: 'code',
        players: new Map(players.map((uuid) => [uuid, { uuid, nickname: `user-${uuid}`, isReady: false }])),
        settings: { ...validSettingsPayload({ accessType: 'code', maxPlayers }) },
    }
    matchmaking.__seedRoomForTests(room)
    return room
}

test('join_public_room: 조작된 roomId로 code 방에 코드 없이 들어오려는 시도를 서버가 거부한다', async () => {
    const secret = seedCodeRoom({ id: 'secret-room', code: 'SECRET', hostUuid: 'uuid-secret-host' })
    const attacker = createFakeSocket('uuid-bypass')
    const io = createFakeIo([attacker])

    await handleJoinPublicRoom(io, attacker, 'uuid-bypass', { roomId: secret.id })

    const failed = attacker.emitted.find((e) => e.event === 'room_join_failed')
    assert.ok(failed, '코드 방 우회 입장은 거부되어야 합니다')
    assert.equal(failed.payload.code, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH)
    assert.equal(attacker.emitted.some((e) => e.event === 'room_joined'), false)

    assert.equal(attacker.joined.length, 0)
    assert.equal(attacker.currentRooms.has(secret.id), false)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([uuid]) => uuid === 'uuid-bypass'), false)
    const [, storedRoom] = snapshot.gameRooms.find(([id]) => id === secret.id)
    assert.equal(storedRoom.players.some(([uuid]) => uuid === 'uuid-bypass'), false)
})

test('join_room_by_code: 코드 없이/빈 코드/틀린 코드로는 code 방에 입장하지 못한다', async () => {
    const secret = seedCodeRoom({ id: 'secret-room-2', code: 'SECRET', hostUuid: 'uuid-secret-host2' })

    const cases = [
        { label: '코드 없음', code: undefined, expected: ROOM_JOIN_ERROR_CODES.CODE_REQUIRED },
        { label: '빈 문자열', code: '', expected: ROOM_JOIN_ERROR_CODES.CODE_REQUIRED },
        { label: '공백뿐', code: '   ', expected: ROOM_JOIN_ERROR_CODES.CODE_REQUIRED },
        { label: '틀린 코드', code: 'WRONG1', expected: ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH },
        { label: '대소문자 불일치', code: 'secret', expected: ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH },
    ]

    for (const { label, code, expected } of cases) {
        const joiner = createFakeSocket(`uuid-wrong-${label}`)
        const io = createFakeIo([joiner])

        await handleJoinRoomByCode(io, joiner, `uuid-wrong-${label}`, code)

        const failed = joiner.emitted.find((e) => e.event === 'room_join_failed')
        assert.ok(failed, `${label}: 거부되어야 합니다`)
        assert.equal(failed.payload.code, expected, label)
        assert.equal(joiner.emitted.some((e) => e.event === 'room_joined'), false, label)
        assert.equal(joiner.joined.length, 0, label)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, storedRoom] = snapshot.gameRooms.find(([id]) => id === secret.id)
    assert.equal(storedRoom.players.length, 1)
    assert.equal(snapshot.playerRoom.filter(([uuid]) => uuid.startsWith('uuid-wrong-')).length, 0)
})

test('join_room_by_code: 선택한 비밀방 roomId가 있으면 방 없음과 코드 불일치를 구분한다', async () => {
    const secret = seedCodeRoom({ id: 'selected-secret', code: 'SECRET', hostUuid: 'uuid-selected-host' })

    const mismatchSocket = createFakeSocket('uuid-selected-mismatch')
    await handleJoinRoomByCode(
        createFakeIo([mismatchSocket]),
        mismatchSocket,
        'uuid-selected-mismatch',
        'WRONG1',
        { roomId: secret.id, accessType: 'code' },
    )
    assert.equal(
        mismatchSocket.emitted.find((event) => event.event === 'room_join_failed')?.payload?.code,
        ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH,
    )

    const missingSocket = createFakeSocket('uuid-selected-missing')
    await handleJoinRoomByCode(
        createFakeIo([missingSocket]),
        missingSocket,
        'uuid-selected-missing',
        'SECRET',
        { roomId: 'missing-secret', accessType: 'code' },
    )
    assert.equal(
        missingSocket.emitted.find((event) => event.event === 'room_join_failed')?.payload?.code,
        ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND,
    )
})

test('입장 거부 사유(코드 불일치·방 없음·이미 시작됨·정원 초과)는 서로 다른 안정적 코드로 응답된다', async () => {
    const codeOf = (socket) => socket.emitted.find((e) => e.event === 'room_join_failed')?.payload?.code

    const mismatchSocket = createFakeSocket('uuid-reason-mismatch')
    const io = createFakeIo([mismatchSocket])
    await handleJoinRoomByCode(io, mismatchSocket, 'uuid-reason-mismatch', 'NOSUCH')

    const notFoundSocket = createFakeSocket('uuid-reason-notfound')
    io.sockets.sockets.set(notFoundSocket.id, notFoundSocket)
    await handleJoinPublicRoom(io, notFoundSocket, 'uuid-reason-notfound', { roomId: 'no-such-room' })

    seedCodeRoom({
        id: 'reason-full-room',
        code: 'FULL01',
        hostUuid: 'uuid-reason-fullhost',
        players: ['uuid-reason-fullhost', 'uuid-reason-f2', 'uuid-reason-f3', 'uuid-reason-f4'],
        maxPlayers: 4,
    })
    const fullSocket = createFakeSocket('uuid-reason-full')
    io.sockets.sockets.set(fullSocket.id, fullSocket)
    await handleJoinRoomByCode(io, fullSocket, 'uuid-reason-full', 'FULL01')

    const { room: startedRoom } = await setupReadyRoomForStart(io, 'uuid-reason-host', 'uuid-reason-joiner', {
        handleCreateRoom, handleJoinRoomByCode, handleSetReady,
    })
    const startAck = await callAsPromise(
        handleStartGame, io, io.sockets.sockets.get('sock-uuid-reason-host'), 'uuid-reason-host',
        startPayload(startedRoom),
    )
    assert.equal(startAck.ok, true, '이 검증의 전제인 게임 시작이 실패했습니다')

    const startedSocket = createFakeSocket('uuid-reason-started')
    io.sockets.sockets.set(startedSocket.id, startedSocket)
    await handleJoinRoomByCode(io, startedSocket, 'uuid-reason-started', startedRoom.roomCode)

    assert.equal(codeOf(mismatchSocket), ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH)
    assert.equal(codeOf(notFoundSocket), ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND)
    assert.equal(codeOf(fullSocket), ROOM_JOIN_ERROR_CODES.ROOM_FULL)
    assert.equal(codeOf(startedSocket), ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED)

    const codes = [mismatchSocket, notFoundSocket, fullSocket, startedSocket].map(codeOf)
    assert.equal(new Set(codes).size, 4)
    for (const socket of [mismatchSocket, notFoundSocket, fullSocket, startedSocket]) {
        assert.equal(typeof socket.emitted.find((e) => e.event === 'room_join_failed').payload.message, 'string')
    }
})

test('공개 방 목록 DTO는 code 방 여부는 알려주되 실제 입장 코드는 노출하지 않는다', async () => {
    const host = createFakeSocket('uuid-dto-codehost')
    const io = createFakeIo([host])
    const created = await callAsPromise(
        handleCreateRoom, io, host, 'uuid-dto-codehost', validSettingsPayload({ accessType: 'code' }),
    )
    const actualCode = created.room.roomCode
    assert.equal(typeof actualCode, 'string')

    const listed = await callAsPromise(handleGetPublicRooms)
    const broadcast = io.broadcasts.find((entry) => entry.event === 'public_rooms_updated')
    assert.ok(broadcast, '방 생성 직후 목록 방송이 있어야 합니다')

    for (const dto of [...listed.rooms, ...broadcast.payload.rooms]) {
        assert.equal(dto.accessType, 'code')
        assert.equal(Object.hasOwn(dto, 'code'), false)
        assert.equal(Object.hasOwn(dto, 'roomCode'), false)
        assert.equal(Object.values(dto).includes(actualCode), false)
    }
})

test('join_room_by_code: 방별 maxPlayers를 적용해 4인 방의 5번째 참가를 거부한다', async () => {
    const hostSocket = createFakeSocket('uuid-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }))
    const { roomCode } = created.room

    for (const uuid of ['uuid-p1', 'uuid-p2', 'uuid-p3']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    assert.equal(room.players.length, 4)

    const fifthSocket = createFakeSocket('uuid-p4')
    io.sockets.sockets.set(fifthSocket.id, fifthSocket)
    await handleJoinRoomByCode(io, fifthSocket, 'uuid-p4', roomCode)
    assert.match(fifthSocket.emitted.at(-1).payload.message, /가득 찼습니다/)

    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(after.gameRooms[0][1].players.length, 4)
})

test('join_room_by_code: settings가 없는 구버전(랜덤 매칭) 방은 기존 매칭 정원으로 fallback한다', async () => {
    matchmaking.__seedRoomForTests({
        id: 'legacy-room',
        code: 'LEGACY1',
        hostUuid: 'uuid-legacy-host',
        players: new Map([['uuid-legacy-host', { uuid: 'uuid-legacy-host', nickname: 'host' }]]),
    })

    const socket = createFakeSocket('uuid-legacy-join')
    const io = createFakeIo([socket])
    await handleJoinRoomByCode(io, socket, 'uuid-legacy-join', 'LEGACY1')

    assert.ok(socket.emitted.some((e) => e.event === 'room_joined'))
})

test('join_room_by_code: 동일 사용자의 join+join 동시 요청 중 하나만 성공한다', async () => {
    const hostSocket = createFakeSocket('uuid-host2')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host2', validSettingsPayload())
    const { roomCode } = created.room

    const joiner = createFakeSocket('uuid-joiner')
    io.sockets.sockets.set(joiner.id, joiner)

    await Promise.all([
        handleJoinRoomByCode(io, joiner, 'uuid-joiner', roomCode),
        handleJoinRoomByCode(io, joiner, 'uuid-joiner', roomCode),
    ])

    const joinedEvents = joiner.emitted.filter((e) => e.event === 'room_joined')
    assert.equal(joinedEvents.length, 1)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === created.room.roomId)
    assert.equal(room.players.length, 2)
})

test('create_room과 join_room_by_code를 같은 사용자로 교차 실행해도 한 방에만 소속된다', async () => {
    const gate = deferred()
    fakeFindByUuid = async (uuid) => {
        await gate.promise
        return { nickname: `user-${uuid}` }
    }

    const hostSocket = createFakeSocket('uuid-host3')
    const io = createFakeIo([hostSocket])
    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
    const preCreated = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host3', validSettingsPayload())
    const { roomCode } = preCreated.room

    fakeFindByUuid = async (uuid) => {
        await gate.promise
        return { nickname: `user-${uuid}` }
    }

    const uuid = 'uuid-cross'
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)

    const createPromise = callAsPromise(handleCreateRoom, io, socket, uuid, validSettingsPayload())
    const joinPromise = handleJoinRoomByCode(io, socket, uuid, roomCode)

    gate.resolve()
    const createResult = await createPromise
    await joinPromise

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const roomsContainingUuid = snapshot.gameRooms.filter(([, room]) => room.players.some(([pUuid]) => pUuid === uuid))
    assert.equal(roomsContainingUuid.length, 1)

    if (createResult.ok) {
        assert.equal(roomsContainingUuid[0][0], createResult.room.roomId)
    }
})

test('get_current_room: 참가 중인 방이 없으면 room:null을 반환한다', async () => {
    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-none')
    assert.deepEqual(res, { ok: true, room: null })
})

test('get_current_room: 실제 참가자면 방 정보를 반환한다', async () => {
    const socket = createFakeSocket('uuid-K')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-K', validSettingsPayload())

    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-K')
    assert.equal(res.ok, true)
    assert.equal(res.room.roomId, created.room.roomId)
})

test('get_current_room: 생성이 아직 처리 중이면 pending:true를 반환한다', async () => {
    const gate = deferred()
    fakeFindByUuid = () => gate.promise

    const socket = createFakeSocket('uuid-pending')
    const io = createFakeIo([socket])

    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-pending', validSettingsPayload())

    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-pending')
    assert.deepEqual(res, { ok: true, room: null, pending: true })

    gate.resolve({ nickname: 'x' })
    await createPromise
})

test('get_current_room: playerRoom만 있고 실제 room.players에 없는 stale 매핑은 정리되고 null을 반환한다', async () => {
    matchmaking.__seedPlayerRoomForTests('uuid-stale', 'room-없음')
    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-stale')
    assert.deepEqual(res, { ok: true, room: null })

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.length, 0)
})

test('get_current_room: callback이 없는 요청은 상태를 바꾸지 않는다', () => {
    matchmaking.__seedPlayerRoomForTests('uuid-L', 'room-없음')
    const before = matchmaking.__getStateSnapshotForTests()
    handleGetCurrentRoom('uuid-L', undefined)
    const after = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(after, before)
})

test('join_matchmaking: 큐에 등록되지 않고 matchmaking_disabled를 응답한다', async () => {
    const socket = createFakeSocket('uuid-M')
    const io = createFakeIo([socket])

    await handleJoinMatchmaking(io, socket, 'uuid-M')

    assert.equal(socket.emitted.length, 1)
    assert.equal(socket.emitted[0].event, 'matchmaking_disabled')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.matchmakingQueue.length, 0)
})

test('onDisconnect: 방장 혼자 있는 방에서 종료하면 방과 매핑이 삭제된다', async () => {
    const socket = createFakeSocket('uuid-solo')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-solo', validSettingsPayload())

    matchmaking.onDisconnect(io, socket, 'uuid-solo')
    matchmaking.__flushRoomRetentionForTests()

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('onDisconnect: 참가자가 있는 상태에서 방장이 종료하면 host_changed와 player_left_room이 발생한다', async () => {
    const hostSocket = createFakeSocket('uuid-host4')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host4', validSettingsPayload())

    const joiner = createFakeSocket('uuid-joiner2')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-joiner2', created.room.roomCode)

    matchmaking.onDisconnect(io, hostSocket, 'uuid-host4')
    matchmaking.__flushRoomRetentionForTests()

    const hostChanged = io.broadcasts.find((b) => b.event === 'host_changed')
    const playerLeft = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.ok(hostChanged)
    assert.equal(hostChanged.payload.hostUuid, 'uuid-joiner2')
    assert.ok(playerLeft)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms[0][1].hostUuid, 'uuid-joiner2')
})

test('onDisconnect(ABA): 방을 삭제하고 다른 Socket으로 새 Room을 만든 뒤 도착한 오래된 Socket의 지연 disconnect는 새 Room을 건드리지 않는다', async () => {
    const uuid = 'aba-mm-uuid'
    const staleSocket = createFakeSocket(uuid)
    const io = createFakeIo([staleSocket])
    await callAsPromise(handleCreateRoom, io, staleSocket, uuid, validSettingsPayload())

    const { handleDeleteRoom } = matchmaking.__testables
    handleDeleteRoom(io, uuid)

    const freshSocket = createFakeSocket(uuid, { id: 'sock-aba-mm-uuid-2' })
    io.sockets.sockets.set(freshSocket.id, freshSocket)
    const createdB = await callAsPromise(handleCreateRoom, io, freshSocket, uuid, validSettingsPayload())
    assert.equal(createdB.ok, true)

    io.broadcasts.length = 0
    matchmaking.onDisconnect(io, staleSocket, uuid)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.ok(snapshot.gameRooms.some(([id]) => id === createdB.room.roomId), 'Room B가 그대로 남아있어야 한다')
    assert.equal(snapshot.playerRoom.some(([u, roomId]) => u === uuid && roomId === createdB.room.roomId), true)
    assert.equal(io.broadcasts.some((b) => b.event === 'player_left_room' || b.event === 'host_changed'), false)
})

test('onDisconnect(ABA): activeRoomId 결합이 없는 레거시 Socket의 disconnect는 기존처럼 현재 Room을 무조건 정리한다', async () => {
    const uuid = 'legacy-mm-uuid'
    matchmaking.__seedRoomForTests({
        id: 'legacy-room-aba',
        code: 'LEGACYABA',
        hostUuid: uuid,
        players: new Map([[uuid, { uuid, nickname: 'x', isReady: false }]]),
    })
    matchmaking.__seedPlayerRoomForTests(uuid, 'legacy-room-aba')
    const socketWithoutBinding = createFakeSocket(uuid)
    const io = createFakeIo([socketWithoutBinding])

    matchmaking.onDisconnect(io, socketWithoutBinding, uuid)
    matchmaking.__flushRoomRetentionForTests()

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('onDisconnect(ABA): 오래된 Socket A의 지연 disconnect는 같은 uuid로 새로 큐에 등록된 Socket B의 항목을 지우지 않는다', async () => {
    const uuid = 'aba-queue-uuid'
    const staleSocket = createFakeSocket(uuid, { id: 'sock-aba-queue-old' })
    const io = createFakeIo([staleSocket])

    matchmaking.__seedMatchmakingQueueForTests(uuid, { uuid, nickname: 'x', socketId: staleSocket.id })

    matchmaking.__seedMatchmakingQueueForTests(uuid, { uuid, nickname: 'x', socketId: 'sock-aba-queue-new' })

    matchmaking.onDisconnect(io, staleSocket, uuid)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, queued] = snapshot.matchmakingQueue.find(([u]) => u === uuid) ?? []
    assert.ok(queued, 'Socket B의 큐 항목이 남아있어야 한다')
    assert.equal(queued.socketId, 'sock-aba-queue-new')
})

test('create_room: 사용자 조회를 기다리는 동안 연결이 끊기면 방이 커밋되지 않는다', async () => {
    const gate = deferred()
    fakeFindByUuid = async (uuid) => { await gate.promise; return { nickname: `user-${uuid}` } }

    const socket = createFakeSocket('uuid-disc')
    const io = createFakeIo([socket])

    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-disc', validSettingsPayload())

    socket.connected = false
    matchmaking.onDisconnect(io, socket, 'uuid-disc')

    gate.resolve({ nickname: 'x' })
    const res = await createPromise

    assert.equal(res.ok, false)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
    assert.equal(snapshot.pendingRoomTransitions.length, 0)
})

test('create_room: socket.join 대기 중 연결이 끊기면 Socket room을 정리하고 Map에 흔적을 남기지 않는다', async () => {
    const gate = deferred()
    const socket = createFakeSocket('uuid-disc2', { joinGate: gate.promise })
    const io = createFakeIo([socket])

    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-disc2', validSettingsPayload())

    await socket.joinCalled
    socket.connected = false
    gate.resolve()
    const res = await createPromise

    assert.equal(res.ok, false)
    assert.equal(socket.left.length, 1)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('create_room: 성공 후 store 반영을 가정하는 room 객체는 재사용 가능한 형태를 유지한다(성공 콜백은 Map 커밋 이후에만 호출)', async () => {
    const socket = createFakeSocket('uuid-cb')
    const io = createFakeIo([socket])
    let callbackCallCount = 0
    const wrappedCallback = (res) => { callbackCallCount += 1; return res }

    const result = await new Promise((resolve) => {
        handleCreateRoom(io, socket, 'uuid-cb', validSettingsPayload(), (res) => {
            wrappedCallback(res)
            resolve(res)
        })
    })

    assert.equal(result.ok, true)
    assert.equal(callbackCallCount, 1)
})

test('join_room_by_code: socket.join() 실패 시 방 상태가 변하지 않고 실패 응답을 보낸다', async () => {
    const hostSocket = createFakeSocket('uuid-jjhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-jjhost', validSettingsPayload())

    const joiner = createFakeSocket('uuid-jjoin', { joinShouldReject: true })
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-jjoin', created.room.roomCode)

    assert.match(joiner.emitted.at(-1).payload.message, /참여하지 못했습니다/)
    const after = matchmaking.__getStateSnapshotForTests()
    const [, room] = after.gameRooms.find(([id]) => id === created.room.roomId)
    assert.equal(room.players.length, 1)
    assert.equal(after.pendingRoomTransitions.length, 0)
})

test('join_room_by_code: join 이후 커밋 전 예상 못한 예외가 나면 Socket room에서도 나간다', async () => {
    const io = createFakeIo([])
    const roomId = 'room-exc'
    const roomCode = 'EXC123'
    const brokenSettings = new Proxy({}, {
        get(target, prop, receiver) {
            if (prop === 'maxPlayers') throw new Error('설정 조회 실패(테스트 주입)')
            return Reflect.get(target, prop, receiver)
        },
    })
    matchmaking.__seedRoomForTests({
        id: roomId,
        code: roomCode,
        hostUuid: 'uuid-exchost',
        players: new Map([['uuid-exchost', { uuid: 'uuid-exchost', nickname: 'host' }]]),
        settings: brokenSettings,
    })

    const joiner = createFakeSocket('uuid-excjoin')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-excjoin', roomCode)

    const failed = joiner.emitted.find((e) => e.event === 'room_join_failed')
    assert.match(failed.payload.message, /참여하지 못했습니다/)
    assert.equal(failed.payload.code, ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR)
    assert.equal(joiner.left.length, 1)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 1)
    assert.equal(snapshot.playerRoom.some(([u]) => u === 'uuid-excjoin'), false)
})

test('join_room_by_code: 마지막 한 자리에 서로 다른 두 사용자가 동시 참가해도 정원을 넘기지 않는다', async () => {
    const hostSocket = createFakeSocket('uuid-lasthost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-lasthost', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 })
    )
    const { roomCode, roomId } = created.room

    for (const uuid of ['uuid-pre1', 'uuid-pre2']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }

    const gateA = deferred()
    const gateB = deferred()
    const socketA = createFakeSocket('uuid-raceA', { joinGate: gateA.promise })
    const socketB = createFakeSocket('uuid-raceB', { joinGate: gateB.promise })
    io.sockets.sockets.set(socketA.id, socketA)
    io.sockets.sockets.set(socketB.id, socketB)

    const joinA = handleJoinRoomByCode(io, socketA, 'uuid-raceA', roomCode)
    const joinB = handleJoinRoomByCode(io, socketB, 'uuid-raceB', roomCode)

    gateA.resolve()
    gateB.resolve()
    await Promise.all([joinA, joinB])

    const succeeded = [socketA, socketB].filter((s) => s.emitted.some((e) => e.event === 'room_joined'))
    const failed = [socketA, socketB].filter((s) => s.emitted.some((e) => e.event === 'room_join_failed'))
    assert.equal(succeeded.length, 1)
    assert.equal(failed.length, 1)
    assert.match(failed[0].emitted.find((e) => e.event === 'room_join_failed').payload.message, /가득 찼습니다/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 4)
})

test('join_room_by_code: join 대기 중 다른 참가자가 먼저 마지막 자리를 채우면 정원 초과로 거부된다', async () => {
    const hostSocket = createFakeSocket('uuid-fillhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-fillhost', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 })
    )
    const { roomCode, roomId } = created.room

    for (const uuid of ['uuid-pre3', 'uuid-pre4']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }

    const gate = deferred()
    const laggingJoiner = createFakeSocket('uuid-lag', { joinGate: gate.promise })
    io.sockets.sockets.set(laggingJoiner.id, laggingJoiner)
    const joinPromise = handleJoinRoomByCode(io, laggingJoiner, 'uuid-lag', roomCode)

    const fastJoiner = createFakeSocket('uuid-fast')
    io.sockets.sockets.set(fastJoiner.id, fastJoiner)
    await handleJoinRoomByCode(io, fastJoiner, 'uuid-fast', roomCode)

    gate.resolve()
    await joinPromise

    assert.match(laggingJoiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /가득 찼습니다/)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 4)
    assert.equal(laggingJoiner.left.length, 1)
})

test('join_room_by_code: join 대기 중 방이 삭제되면 참가를 거부하고 Socket room에서 나간다', async () => {
    const hostSocket = createFakeSocket('uuid-delhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-delhost', validSettingsPayload())
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-deljoin', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const joinPromise = handleJoinRoomByCode(io, joiner, 'uuid-deljoin', roomCode)

    await joiner.joinCalled
    matchmaking.__removeRoomForTests(roomId)
    gate.resolve()
    await joinPromise

    assert.match(joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /찾을 수 없습니다/)
    assert.equal(joiner.left.length, 1)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
})

test('join_room_by_code: join 대기 중 같은 id의 다른 Room 객체로 교체되면 참가를 거부한다', async () => {
    const hostSocket = createFakeSocket('uuid-swaphost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-swaphost', validSettingsPayload())
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-swapjoin', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const joinPromise = handleJoinRoomByCode(io, joiner, 'uuid-swapjoin', roomCode)

    await joiner.joinCalled
    matchmaking.__seedRoomForTests({
        id: roomId,
        code: roomCode,
        hostUuid: 'uuid-swaphost',
        players: new Map([['uuid-swaphost', { uuid: 'uuid-swaphost', nickname: 'host' }]]),
        settings: validSettingsPayload(),
    })
    gate.resolve()
    await joinPromise

    assert.match(joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /찾을 수 없습니다/)
    assert.equal(joiner.left.length, 1)
})

const channelMembership = require('../../socket/channelMembership')

function receivedCount(socket, event) {
    return socket.received.filter((entry) => entry.event === event).length
}

function broadcastThroughProductionBoundary(io, roomId, event, payload = {}) {
    channelMembership.emitToChannel(io, roomId, event, payload)
}

test('F-23(AC-04): join 뒤 재검사에서 거부된 입장자는 채널을 떼지 못해도 그 방의 방송을 받지 않는다', async (t) => {
    t.after(() => channelMembership.__resetChannelExclusionsForTests())

    const hostSocket = createFakeSocket('uuid-jbc-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-jbc-host', validSettingsPayload(),
    )
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-jbc-reject', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const joinPromise = handleJoinRoomByCode(io, joiner, 'uuid-jbc-reject', roomCode)

    await joiner.joinCalled
    joiner.leave = () => new Promise(() => {})
    matchmaking.__removeRoomForTests(roomId)
    gate.resolve()
    await joinPromise

    assert.match(
        joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /찾을 수 없습니다/,
    )
    assert.equal(joiner.rooms.has(roomId), true, '전제: leave가 끝나지 않아 채널에 남아 있다')

    broadcastThroughProductionBoundary(io, roomId, 'probe_after_reject')
    assert.equal(
        receivedCount(joiner, 'probe_after_reject'), 0,
        '거부된 입장자가 그 방의 방송을 받았다',
    )
    assert.equal(
        receivedCount(hostSocket, 'probe_after_reject'), 1,
        '정상 참가자가 방송을 받지 못했다',
    )
})

test('F-23(AC-04): 거부됐던 소켓의 다음 정상 입장은 방송을 정상 수신한다(옛 토큰이 남지 않는다)', async (t) => {
    t.after(() => channelMembership.__resetChannelExclusionsForTests())

    const hostSocket = createFakeSocket('uuid-jbc2-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-jbc2-host', validSettingsPayload(),
    )
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-jbc2-join', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const rejected = handleJoinRoomByCode(io, joiner, 'uuid-jbc2-join', roomCode)
    await joiner.joinCalled
    matchmaking.__removeRoomForTests(roomId)
    gate.resolve()
    await rejected

    const recreated = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-jbc2-host', validSettingsPayload(),
    )
    await handleJoinRoomByCode(io, joiner, 'uuid-jbc2-join', recreated.room.roomCode)

    broadcastThroughProductionBoundary(io, recreated.room.roomId, 'probe_after_rejoin')
    assert.equal(
        receivedCount(joiner, 'probe_after_rejoin'), 1,
        '폐기된 옛 제외 토큰이 남아 새 정상 소속이 방송을 받지 못한다',
    )
})

test('F-23(AC-04): 전달에서 제외된 소켓은 확정 참가자의 소켓이어도 game_started를 받지 않는다', async (t) => {
    t.after(() => channelMembership.__resetChannelExclusionsForTests())

    const hostSocket = createFakeSocket('uuid-excl-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(
        io, 'uuid-excl-host', 'uuid-excl-joiner', readyRoomHandlers,
    )

    const staleSocket = createFakeSocket('uuid-excl-joiner', { id: 'sock-uuid-excl-joiner-stale' })
    staleSocket.rooms.add(room.roomId)
    io.sockets.sockets.set(staleSocket.id, staleSocket)
    channelMembership.excludeSocketFromChannel(room.roomId, staleSocket.id, 'stale-detach')

    const { getResponse, callback } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-excl-host', startPayload(room), callback)

    assert.equal(getResponse().ok, true)
    assert.equal(
        staleSocket.emitted.filter((e) => e.event === 'game_started').length, 0,
        '전달에서 제외된 소켓이 game_started를 받았다',
    )
    assert.equal(joinerSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
})

test('leaveSocketRoomSafely: leave가 undefined/resolved Promise/동기 예외/reject 무엇을 반환해도 예외를 던지지 않는다', async () => {
    const cases = [
        () => undefined,
        () => Promise.resolve(),
        () => { throw new Error('동기 예외') },
        () => Promise.reject(new Error('비동기 reject')),
    ]
    for (const leave of cases) {
        const fakeSocket = { leave }
        await assert.doesNotReject(() => leaveSocketRoomSafely(fakeSocket, 'room-x', '[테스트]'))
    }
})

test('공개방 입장: 선택한 open 방(A)이 대기 중 삭제되고 같은 코드의 code 방(B)이 생기면 참가가 거부되고 B에 반영되지 않는다', async () => {
    const hostASocket = createFakeSocket('uuid-raceAhost')
    const io = createFakeIo([hostASocket])
    const createdA = await callAsPromise(handleCreateRoom, io, hostASocket, 'uuid-raceAhost', validSettingsPayload())
    const roomAId = createdA.room.roomId
    const roomACode = createdA.room.roomCode

    const gate = deferred()
    fakeFindByUuid = async (uuid) => { await gate.promise; return { nickname: `user-${uuid}` } }

    const joinerSocket = createFakeSocket('uuid-racejoiner')
    io.sockets.sockets.set(joinerSocket.id, joinerSocket)
    const joinPromise = handleJoinPublicRoom(io, joinerSocket, 'uuid-racejoiner', { roomId: roomAId })

    await Promise.resolve()

    matchmaking.__removeRoomForTests(roomAId)
    matchmaking.__seedRoomForTests({
        id: 'room-B',
        code: roomACode,
        hostUuid: 'uuid-hostB',
        title: 'B',
        accessType: 'code',
        players: new Map([['uuid-hostB', { uuid: 'uuid-hostB', nickname: 'hostB' }]]),
        settings: {
            maxPlayers: 8, jokerCount: 2, lightsOut: false, soulBetting: false,
            dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90, voteReveal: true,
        },
    })

    gate.resolve({ nickname: 'user-uuid-racejoiner' })
    await joinPromise

    const failedEvent = joinerSocket.emitted.find((e) => e.event === 'room_join_failed')
    assert.ok(failedEvent, '참가가 거부되어야 하는데 실패 이벤트가 없습니다')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, roomB] = snapshot.gameRooms.find(([id]) => id === 'room-B')
    assert.ok(roomB)
    assert.equal(roomB.players.some(([pUuid]) => pUuid === 'uuid-racejoiner'), false)
    assert.equal(snapshot.playerRoom.some(([pUuid]) => pUuid === 'uuid-racejoiner'), false)

    assert.equal(joinerSocket.currentRooms.has('room-B'), false)
})

test('set_ready: 새로 생성/참가한 플레이어는 기본적으로 준비 안 됨 상태다', async () => {
    const hostSocket = createFakeSocket('uuid-ready-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-host', validSettingsPayload())
    assert.equal(created.room.players[0].isReady, false)

    const joiner = createFakeSocket('uuid-ready-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-joiner', created.room.roomCode)
    const joinedPayload = joiner.emitted.find((e) => e.event === 'room_joined').payload
    const joinerEntry = joinedPayload.players.find((p) => p.uuid === 'uuid-ready-joiner')
    assert.equal(joinerEntry.isReady, false)
})

test('set_ready: 동일한 목표 상태로 두 번 요청해도 결과가 같고 두 번째 요청은 방송하지 않는다', async () => {
    const socket = createFakeSocket('uuid-ready-idem')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-idem', validSettingsPayload())

    const res1 = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-idem', readyPayload(created.room))
    assert.equal(res1.ok, true)
    assert.equal(res1.isReady, true)
    assert.equal(socket.emitted.filter((e) => e.event === 'player_ready_changed').length, 1)

    const res2 = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-idem', readyPayload(created.room))
    assert.equal(res2.ok, true)
    assert.equal(res2.isReady, true)
    assert.equal(socket.emitted.filter((e) => e.event === 'player_ready_changed').length, 1)
})

test('set_ready: isReady가 boolean이 아니면 상태 변경 없이 거부한다', async () => {
    const socket = createFakeSocket('uuid-ready-badtype')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-badtype', validSettingsPayload())

    for (const badValue of ['true', 1, null, undefined, {}, []]) {
        const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-badtype',
            { ...readyPayload(created.room), isReady: badValue })
        assert.equal(res.ok, false)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-badtype')
    assert.equal(player.isReady, false)
})

test('set_ready: payload 자체가 null·문자열·배열이면 구조분해 예외 없이 명시적으로 거부한다', async () => {
    const socket = createFakeSocket('uuid-ready-badpayload')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-badpayload', validSettingsPayload())

    for (const badPayload of [null, 'not-an-object', ['isReady', true]]) {
        const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-badpayload', badPayload)
        assert.equal(res.ok, false)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-badpayload')
    assert.equal(player.isReady, false)
})

test('set_ready: payload에 다른 uuid를 넣어도 무시되고 요청자(인증된 uuid) 본인만 바뀐다', async () => {
    const hostSocket = createFakeSocket('uuid-ready-self-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-self-host', validSettingsPayload())

    const joiner = createFakeSocket('uuid-ready-self-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-self-joiner', created.room.roomCode)

    const res = await callAsPromise(
        handleSetReady, io, hostSocket, 'uuid-ready-self-host',
        { ...readyPayload(created.room), uuid: 'uuid-ready-self-joiner' },
    )
    assert.equal(res.ok, true)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === created.room.roomId)
    const [, hostPlayer] = room.players.find(([uuid]) => uuid === 'uuid-ready-self-host')
    const [, joinerPlayer] = room.players.find(([uuid]) => uuid === 'uuid-ready-self-joiner')
    assert.equal(hostPlayer.isReady, true)
    assert.equal(joinerPlayer.isReady, false)
})

test('set_ready: 방에 참여하지 않은 사용자의 요청은 거부된다', async () => {
    const io = createFakeIo([])
    const socket = createFakeSocket('uuid-ready-outside')
    const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-outside', {
        isReady: true, roomId: 'room-not-joined', expectedSettingsVersion: 1,
    })
    assert.equal(res.ok, false)
    assert.match(res.message, /참여 중인 방이 없습니다/)
})

test('set_ready: 방이 이미 삭제된 뒤 도착한 요청은 안전하게 실패한다', async () => {
    const socket = createFakeSocket('uuid-ready-deleted')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-deleted', validSettingsPayload())
    matchmaking.__removeRoomForTests(created.room.roomId)

    const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-deleted', readyPayload(created.room))
    assert.equal(res.ok, false)
})

test('set_ready: callback이 없는 요청은 실제 Room·참가자가 있어도 isReady/canStart/Map 무엇도 바꾸지 않는다', async () => {
    const socket = createFakeSocket('uuid-ready-nocb')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-nocb', validSettingsPayload())

    const before = matchmaking.__getStateSnapshotForTests()
    handleSetReady(io, socket, 'uuid-ready-nocb', readyPayload(created.room), undefined)
    const after = matchmaking.__getStateSnapshotForTests()

    assert.deepEqual(after, before)
    const [, room] = after.gameRooms.find(([id]) => id === created.room.roomId)
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-nocb')
    assert.equal(player.isReady, false)
    assert.equal(created.room.canStart, false)
})

test('set_ready: 요청자는 ack만 받고, 같은 방의 다른 참가자는 player_ready_changed만 받는다(요청자 자신은 받지 않음)', async () => {
    const registry = new Map()
    function makeDeliveringSocket(uuid) {
        const s = createFakeSocket(uuid)
        s.to = (roomId) => ({
            emit(event, payload) {
                for (const other of registry.values()) {
                    if (other === s) continue
                    if (other.currentRooms.has(roomId)) other.emitted.push({ event, payload })
                }
            },
        })
        registry.set(uuid, s)
        return s
    }

    const hostSocket = makeDeliveringSocket('uuid-ready-recv-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-recv-host', validSettingsPayload())

    const joiner = makeDeliveringSocket('uuid-ready-recv-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-recv-joiner', created.room.roomCode)

    hostSocket.emitted.length = 0
    joiner.emitted.length = 0

    const ack = await callAsPromise(handleSetReady, io, hostSocket, 'uuid-ready-recv-host', readyPayload(created.room))
    assert.equal(ack.ok, true)

    assert.equal(hostSocket.emitted.some((e) => e.event === 'player_ready_changed'), false)

    const received = joiner.emitted.find((e) => e.event === 'player_ready_changed')
    assert.ok(received)
    assert.equal(received.payload.uuid, 'uuid-ready-recv-host')
    assert.equal(received.payload.isReady, true)
})

test('canStart: 전원 준비된 방에 새 참가자가 들어오면(기본 미준비) canStart가 다시 false로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-a-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-a-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-a-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-a-joinerA', created.room.roomCode)

    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-canstart-a-host', readyPayload(created.room))
    const joinerAReady = await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-a-joinerA', readyPayload(created.room))
    assert.equal(joinerAReady.canStart, true)

    const joinerB = createFakeSocket('uuid-canstart-a-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-a-joinerB', created.room.roomCode)

    const joinedBroadcast = joinerB.emitted.find((e) => e.event === 'player_joined_room')
    assert.equal(joinedBroadcast.payload.canStart, false)
})

test('canStart: 미준비 참가자가 나가면 canStart가 다시 true로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-b-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-b-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-b-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-b-joinerA', created.room.roomCode)
    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-canstart-b-host', readyPayload(created.room))
    await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-b-joinerA', readyPayload(created.room))

    const joinerB = createFakeSocket('uuid-canstart-b-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-b-joinerB', created.room.roomCode)

    matchmaking.onDisconnect(io, joinerB, 'uuid-canstart-b-joinerB')
    matchmaking.__flushRoomRetentionForTests()

    const leftBroadcast = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.ok(leftBroadcast)
    assert.equal(leftBroadcast.payload.canStart, true)
})

test('canStart: 방장이 종료로 바뀌어도 남은 참가자의 준비 상태는 유지되고 canStart가 새 구성 기준으로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-c-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-c-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-c-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-c-joinerA', created.room.roomCode)
    const joinerB = createFakeSocket('uuid-canstart-c-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-c-joinerB', created.room.roomCode)

    await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-c-joinerA', readyPayload(created.room))
    await callAsPromise(handleSetReady, io, joinerB, 'uuid-canstart-c-joinerB', readyPayload(created.room))

    matchmaking.onDisconnect(io, hostSocket, 'uuid-canstart-c-host')
    matchmaking.__flushRoomRetentionForTests()

    const hostChanged = io.broadcasts.find((b) => b.event === 'host_changed')
    assert.ok(hostChanged)
    assert.equal(hostChanged.payload.hostUuid, 'uuid-canstart-c-joinerA')
    assert.equal(hostChanged.payload.canStart, true)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, joinerAPlayer] = room.players.find(([uuid]) => uuid === 'uuid-canstart-c-joinerA')
    assert.equal(joinerAPlayer.isReady, true)
})

test('start_game: 참여 중인 방이 없으면 ROOM_NOT_FOUND로 ack가 정확히 한 번 온다', async () => {
    const socket = createFakeSocket('uuid-start-noroom')
    const io = createFakeIo([socket])
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()

    await handleStartGame(io, socket, 'uuid-start-noroom',
        { roomId: 'room-not-joined', expectedSettingsVersion: 1 }, callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'ROOM_NOT_FOUND')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 방이 이미 삭제된 상태에서의 요청은 ROOM_NOT_FOUND로 안전하게 실패한다', async () => {
    const socket = createFakeSocket('uuid-start-deleted')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-start-deleted', validSettingsPayload())
    matchmaking.__removeRoomForTests(created.room.roomId)

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const res = await callAsPromise(handleStartGame, io, socket, 'uuid-start-deleted', startPayload(created.room))
    assert.equal(res.ok, false)
    assert.equal(res.code, 'ROOM_NOT_FOUND')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 방장이 아닌 사용자의 요청은 NOT_HOST로 ack가 정확히 한 번 온다', async () => {
    const hostSocket = createFakeSocket('uuid-start-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-start-host', validSettingsPayload())

    const joiner = createFakeSocket('uuid-start-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-start-joiner', created.room.roomCode)

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, joiner, 'uuid-start-joiner', startPayload(created.room), callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'NOT_HOST')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 운영 최소 인원 기준으로 인원이 미달이면 MIN_PLAYERS_NOT_MET으로 ack가 정확히 한 번 온다', async () => {
    const originalMin = process.env.GAME_DEV_MIN_PLAYERS
    process.env.GAME_DEV_MIN_PLAYERS = '2'
    try {
        const hostSocket = createFakeSocket('uuid-start-min')
        const io = createFakeIo([hostSocket])
        const created = await callAsPromise(
            handleCreateRoom, io, hostSocket, 'uuid-start-min', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
        )
        const beforeSession = gameSession.__getStateSnapshotForTests()
        const { callback, getCalls, getResponse } = countingCallback()
        await handleStartGame(io, hostSocket, 'uuid-start-min', startPayload(created.room), callback)

        assert.equal(getCalls(), 1)
        assert.equal(getResponse().ok, false)
        assert.equal(getResponse().code, 'MIN_PLAYERS_NOT_MET')
        assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    } finally {
        if (originalMin === undefined) delete process.env.GAME_DEV_MIN_PLAYERS
        else process.env.GAME_DEV_MIN_PLAYERS = originalMin
    }
})

test('start_game: 실제 참가 인원이 광대 수 이하이면(비-광대 0명) MIN_PLAYERS_NOT_MET으로 거부된다', async () => {
    const hostSocket = createFakeSocket('uuid-start-joker')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-start-joker', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const res = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-start-joker', startPayload(created.room))
    assert.equal(res.ok, false)
    assert.equal(res.code, 'MIN_PLAYERS_NOT_MET')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 정원(4)이 운영 최소 인원(5)보다 작아도 정원만큼 채우고 전원 준비하면 인원 조건을 통과한다', async () => {
    const originalMin = process.env.GAME_DEV_MIN_PLAYERS
    process.env.GAME_DEV_MIN_PLAYERS = '5'
    try {
        const hostSocket = createFakeSocket('uuid-cap-host')
        const io = createFakeIo([hostSocket])
        const created = await callAsPromise(
            handleCreateRoom, io, hostSocket, 'uuid-cap-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
        )
        const { roomCode } = created.room

        const sockets = { 'uuid-cap-host': hostSocket }
        for (const uuid of ['uuid-cap-p1', 'uuid-cap-p2', 'uuid-cap-p3']) {
            const s = createFakeSocket(uuid)
            io.sockets.sockets.set(s.id, s)
            await handleJoinRoomByCode(io, s, uuid, roomCode)
            sockets[uuid] = s
        }

        for (const [uuid, s] of Object.entries(sockets)) {
            await callAsPromise(handleSetReady, io, s, uuid, readyPayload(created.room))
        }

        const res = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-cap-host', startPayload(created.room))
        assert.equal(res.ok, true)
    } finally {
        if (originalMin === undefined) delete process.env.GAME_DEV_MIN_PLAYERS
        else process.env.GAME_DEV_MIN_PLAYERS = originalMin
    }
})

test('start_game: 준비하지 않은 참가자가 있으면 PLAYERS_NOT_READY로 ack가 정확히 한 번 온다', async () => {
    const hostSocket = createFakeSocket('uuid-start-notready-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-start-notready-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joiner = createFakeSocket('uuid-start-notready-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-start-notready-joiner', created.room.roomCode)

    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-start-notready-host', readyPayload(created.room))

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-notready-host', startPayload(created.room), callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PLAYERS_NOT_READY')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: callback이 없는 요청은 어떤 상태도 바꾸지 않는다', async () => {
    const hostSocket = createFakeSocket('uuid-start-nocb')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-start-nocb', validSettingsPayload())

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const emittedBefore = hostSocket.emitted.length
    await handleStartGame(io, hostSocket, 'uuid-start-nocb', startPayload(created.room), undefined)
    const after = matchmaking.__getStateSnapshotForTests()

    assert.deepEqual(after, before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    assert.equal(hostSocket.emitted.length, emittedBefore)
})

const readyRoomHandlers = { handleCreateRoom, handleJoinRoomByCode, handleSetReady }

test('start_game: 시작 직전 최신 서버 loadout으로 계정 외형을 다시 확보해 game_started에 반영한다(F-13 AC-05, 참가 시점이 아니라 시작 시점 값)', async () => {
    fakeGetGameStartLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: 'player-profile-금빛가면', profileBorderId: 'profile-border-평민', cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))

    const hostSocket = createFakeSocket('uuid-start-profile-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-start-profile-host', 'uuid-start-profile-joiner', readyRoomHandlers)

    fakeGetGameStartLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: 'player-profile-드워프', profileBorderId: 'profile-border-귀족', cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-profile-host', startPayload(room), callback)
    assert.equal(getResponse().ok, true)

    const hostPayload = hostSocket.emitted.find((e) => e.event === 'game_started').payload
    const hostSelf = hostPayload.state.players.find((p) => p.uuid === 'uuid-start-profile-host')
    assert.equal(hostSelf.accountProfilePhotoId, 'player-profile-드워프')
    assert.equal(hostSelf.accountProfileBorderId, 'profile-border-귀족')
})

const ROLE_TO_SKIN_JOB_ID = {
    CITIZEN: 'noble', JOKER: 'clown', DOCTOR: 'doctor', GUARD: 'guard', WITCH_HUNTER: 'witchHunter',
}

test('start_game: 서버가 조회한 직업별 스킨은 자신의 실제 역할에 대응하는 accountSkinId 하나로만 self에 실리고, 카드 프레임은 players[] 전원에게 공개된다(F-14 AC-04, 실제 matchmaking 생산 경로)', async () => {
    const SKINS_BY_JOB = {
        noble: 'player-skin-귀족1-시험용',
        clown: 'player-skin-광대1-시험용',
        guard: 'player-skin-경비원1-시험용',
        doctor: 'player-skin-주치의-시험용',
        witchHunter: 'player-skin-마녀사냥꾼-시험용',
    }
    fakeGetGameStartLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null, profileBorderId: null, cardFrameId: 'player-card-시험용',
            skinsByJob: SKINS_BY_JOB,
        }]))

    const hostSocket = createFakeSocket('uuid-start-skin-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-start-skin-host', 'uuid-start-skin-joiner', readyRoomHandlers)

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-skin-host', startPayload(room), callback)
    assert.equal(getResponse().ok, true)

    const hostPayload = hostSocket.emitted.find((e) => e.event === 'game_started').payload
    const expectedJobId = ROLE_TO_SKIN_JOB_ID[hostPayload.state.self.role]
    assert.equal(hostPayload.state.self.accountSkinId, SKINS_BY_JOB[expectedJobId])

    for (const player of hostPayload.state.players) {
        assert.equal(Object.hasOwn(player, 'accountSkinId'), false)
        assert.equal(Object.hasOwn(player, 'accountSkinsByJob'), false)
        assert.equal(player.accountCardFrameId, 'player-card-시험용')
    }
})

test('start_game: 조회한 계정 전적이 game_started players[]와 재접속 스냅샷 양쪽에 own-property로 실리고, 역할별 통계·비공개 필드는 실리지 않는다(CO S-1 AC-02)', async () => {
    const HOST = 'uuid-record-host'
    const JOINER = 'uuid-record-joiner'
    const RECORDS = new Map([
        [HOST, { totalGames: 3, winRate: 67 }],
        [JOINER, { totalGames: 0, winRate: 0 }],
    ])
    fakeGetAccountRecordSummaries = async (userIds) => new Map(userIds.map((id) => [id, RECORDS.get(id)]))

    const hostSocket = createFakeSocket(HOST)
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, HOST, JOINER, readyRoomHandlers)

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, HOST, startPayload(room), callback)
    assert.equal(getResponse().ok, true)

    const hostPayload = hostSocket.emitted.find((e) => e.event === 'game_started').payload
    const assertRecords = (players, where) => {
        for (const player of players) {
            const expected = RECORDS.get(player.uuid)
            assert.equal(player.accountTotalGames, expected.totalGames, `${where}: ${player.uuid} 판수`)
            assert.equal(player.accountWinRate, expected.winRate, `${where}: ${player.uuid} 승률`)
            assert.equal(Object.hasOwn(player, 'accountTotalGames'), true)
            assert.equal(Object.hasOwn(player, 'accountWinRate'), true)
            assert.equal(Object.hasOwn(player, 'accountSkinsByJob'), false, `${where}: 직업별 스킨이 공개되면 안 된다`)
            assert.equal(Object.hasOwn(player, 'accountSkinId'), false)
            assert.equal(Object.hasOwn(player, 'roleStatistics'), false, `${where}: 역할별 통계는 실리지 않는다`)
            assert.equal(Object.hasOwn(player, 'achievements'), false)
            assert.equal(Object.hasOwn(player, 'role'), false)
        }
    }
    assertRecords(hostPayload.state.players, 'game_started')

    const joinerPayload = joinerSocket.emitted.find((e) => e.event === 'game_started').payload
    assertRecords(joinerPayload.state.players, 'game_started(joiner)')

    const snapshot = gameSession.getSessionSnapshotForPlayer(HOST, hostPayload.gameId)
    assert.equal(snapshot.ok, true)
    assertRecords(snapshot.snapshot.players, 'session_snapshot')
})

test('start_game: 계정 전적 조회가 실패하면 그 필드만 붙지 않고 게임은 정상적으로 시작된다(CO S-1 AC-03)', async () => {
    const HOST = 'uuid-record-fail-host'
    const JOINER = 'uuid-record-fail-joiner'
    fakeGetAccountRecordSummaries = async () => { throw new Error('전적 조회 실패(테스트 주입)') }

    const hostSocket = createFakeSocket(HOST)
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, HOST, JOINER, readyRoomHandlers)

    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, HOST, startPayload(room), callback)

    assert.equal(getResponse().ok, true, '전적 조회 실패가 게임 시작을 막으면 안 된다')
    assert.equal(getCalls(), 1)
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 1, 'GameSession은 정상적으로 커밋돼야 한다')
    assert.equal(hostSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
    assert.equal(joinerSocket.emitted.filter((e) => e.event === 'game_started').length, 1)

    const hostPayload = hostSocket.emitted.find((e) => e.event === 'game_started').payload
    for (const player of hostPayload.state.players) {
        assert.equal(Object.hasOwn(player, 'accountTotalGames'), false, '조회 실패한 전적이 값으로 위장되면 안 된다')
        assert.equal(Object.hasOwn(player, 'accountWinRate'), false)
        assert.equal(Object.hasOwn(player, 'accountProfilePhotoId'), true)
    }

    const snapshot = gameSession.getSessionSnapshotForPlayer(HOST, hostPayload.gameId)
    assert.equal(snapshot.ok, true)
    for (const player of snapshot.snapshot.players) {
        assert.equal(Object.hasOwn(player, 'accountTotalGames'), false)
        assert.equal(Object.hasOwn(player, 'accountWinRate'), false)
    }
})

test('start_game: 반쪽짜리 전적(판수만 있고 승률이 없음)은 아예 싣지 않는다(CO S-1 AC-03)', async () => {
    const HOST = 'uuid-record-partial-host'
    fakeGetAccountRecordSummaries = async (userIds) =>
        new Map(userIds.map((id) => [id, { totalGames: 3 }]))

    const hostSocket = createFakeSocket(HOST)
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, HOST, 'uuid-record-partial-joiner', readyRoomHandlers)

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, HOST, startPayload(room), callback)
    assert.equal(getResponse().ok, true)

    const hostPayload = hostSocket.emitted.find((e) => e.event === 'game_started').payload
    for (const player of hostPayload.state.players) {
        assert.equal(Object.hasOwn(player, 'accountTotalGames'), false, '한쪽만 있는 전적은 화면에서 의미를 만들 수 없다')
        assert.equal(Object.hasOwn(player, 'accountWinRate'), false)
    }
})

test('start_game: 계정 외형 재조회가 실패하면 GameSession을 커밋하지 않고 실패로 응답한다', async () => {
    const hostSocket = createFakeSocket('uuid-start-econ-fail-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-start-econ-fail-host', 'uuid-start-econ-fail-joiner', readyRoomHandlers)

    fakeGetGameStartLoadouts = async () => { throw new Error('economy 조회 실패(테스트 주입)') }

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-econ-fail-host', startPayload(room), callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'INTERNAL_ERROR')
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0, '계정 외형 조회가 실패했으면 GameSession이 커밋되면 안 된다')
    const roomSnapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(roomSnapshot.gameRooms.length, 1, '방은 그대로 유지되어야 한다')
    assert.equal(joinerSocket.emitted.filter((e) => e.event === 'game_started').length, 0)
})

test('start_game: 계정 외형 재조회 중 참가자가 준비를 해제하면 ROOM_STATE_CHANGED로 거부하고 room.players를 부분 반영하지 않는다', async () => {
    const hostSocket = createFakeSocket('uuid-start-race-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room: startedRoom } = await setupReadyRoomForStart(io, 'uuid-start-race-host', 'uuid-start-race-joiner', readyRoomHandlers)

    const gate = deferred()
    fakeGetGameStartLoadouts = async (userIds) => {
        await gate.promise
        return Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: 'player-profile-기사', profileBorderId: 'profile-border-귀족', cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))
    }

    const { callback, getResponse } = countingCallback()
    const startPromise = handleStartGame(io, hostSocket, 'uuid-start-race-host', startPayload(startedRoom), callback)

    await callAsPromise(handleSetReady, io, joinerSocket, 'uuid-start-race-joiner', readyPayload(startedRoom, false))
    gate.resolve()
    await startPromise

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0, '방 상태가 바뀌었으면 GameSession이 커밋되면 안 된다')

    const roomSnapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = roomSnapshot.gameRooms[0]
    const [, joinerEntry] = room.players.find(([playerUuid]) => playerUuid === 'uuid-start-race-joiner')
    assert.equal(joinerEntry.isReady, false, '레이스를 재현한 준비 해제 상태가 그대로 유지되어야 한다')
    assert.equal(joinerEntry.accountProfilePhotoId, null, '조회가 무효화됐으면 room.players는 시작 재조회 이전(참가 시점) 값 그대로여야 한다')
})

test('start_game: 모든 조건을 충족하면 GameSession을 생성하고 참가자별로 역할이 다른 개별 game_started를 전달한다', async () => {
    const hostSocket = createFakeSocket('uuid-start-ok-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-start-ok-host', 'uuid-start-ok-joiner', readyRoomHandlers)

    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-ok-host', startPayload(room), callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, true)
    assert.equal(typeof getResponse().gameId, 'string')

    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 1)

    const roomSnapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(roomSnapshot.gameRooms.length, 0)
    assert.equal(roomSnapshot.playerRoom.length, 0)

    assert.equal(io.broadcasts.some((b) => b.event === 'public_rooms_updated'), true)

    const hostGameStarted = hostSocket.emitted.filter((e) => e.event === 'game_started')
    const joinerGameStarted = joinerSocket.emitted.filter((e) => e.event === 'game_started')
    assert.equal(hostGameStarted.length, 1)
    assert.equal(joinerGameStarted.length, 1)

    for (const { payload } of [...hostGameStarted, ...joinerGameStarted]) {
        for (const player of payload.state.players) {
            assert.equal(Object.hasOwn(player, 'role'), false)
            assert.equal(Object.hasOwn(player, 'team'), false)
        }
    }

    const hostPayload = hostGameStarted[0].payload
    const joinerPayload = joinerGameStarted[0].payload

    assert.equal((JSON.stringify(hostPayload).match(/"role"/g) ?? []).length, 1)
    assert.equal((JSON.stringify(joinerPayload).match(/"role"/g) ?? []).length, 1)

    assert.equal(hostPayload.state.self.uuid, 'uuid-start-ok-host')
    assert.equal(joinerPayload.state.self.uuid, 'uuid-start-ok-joiner')

    const roles = [hostPayload.state.self.role, joinerPayload.state.self.role]
    assert.equal(roles.includes('JOKER'), true)
    assert.equal(roles.includes('CITIZEN'), true)
})

test('start_game: 참가자 중 한 명의 소켓이 connected:false이면 PARTICIPANT_UNAVAILABLE로 거부되고 모든 상태가 불변이다', async () => {
    const hostSocket = createFakeSocket('uuid-pu-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-pu-host', 'uuid-pu-joiner', readyRoomHandlers)
    joinerSocket.connected = false

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const broadcastCountBefore = io.broadcasts.length
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-pu-host', startPayload(room), callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PARTICIPANT_UNAVAILABLE')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), false)
    assert.equal(io.broadcasts.length, broadcastCountBefore)
})

test('start_game: 참가자 중 한 명의 소켓이 Room channel에 join되어 있지 않으면 PARTICIPANT_UNAVAILABLE로 거부되고 모든 상태가 불변이다', async () => {
    const hostSocket = createFakeSocket('uuid-nc-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-nc-host', 'uuid-nc-joiner', readyRoomHandlers)
    joinerSocket.rooms.delete(room.roomId)

    const before = matchmaking.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-nc-host', startPayload(room), callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PARTICIPANT_UNAVAILABLE')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
})

test('start_game: 동일 uuid의 정상적인 복수 소켓 모두에게 game_started가 전달된다', async () => {
    const hostSocket = createFakeSocket('uuid-multi-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-multi-host', 'uuid-multi-joiner', readyRoomHandlers)

    const joinerSecondSocket = createFakeSocket('uuid-multi-joiner', { id: 'sock-uuid-multi-joiner-2' })
    joinerSecondSocket.rooms.add(room.roomId)
    io.sockets.sockets.set(joinerSecondSocket.id, joinerSecondSocket)

    const { getResponse, callback } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-multi-host', startPayload(room), callback)

    assert.equal(getResponse().ok, true)
    assert.equal(joinerSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
    assert.equal(joinerSecondSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
})

test('start_game: payload 사전 생성 단계에서 예외가 나면 INTERNAL_ERROR로 응답하고 모든 상태가 불변이며 game_started가 전달되지 않는다', async (t) => {
    const hostSocket = createFakeSocket('uuid-payloaderr-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-payloaderr-host', 'uuid-payloaderr-joiner', readyRoomHandlers)

    t.mock.method(gameSession, 'buildGameStartedPayload', () => {
        throw new Error('테스트 강제 실패')
    })

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-payloaderr-host', startPayload(room), callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'INTERNAL_ERROR')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), false)
    assert.equal(joinerSocket.emitted.some((e) => e.event === 'game_started'), false)
})

test('start_game: notify 중 한 참가자의 emit이 실패해도 나머지는 정상 수신하고 host ack은 성공한다', async () => {
    const hostSocket = createFakeSocket('uuid-notifyerr-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-notifyerr-host', 'uuid-notifyerr-joiner', readyRoomHandlers)
    joinerSocket.emit = () => { throw new Error('emit 실패(테스트 주입)') }

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-notifyerr-host', startPayload(room), callback)

    assert.equal(getResponse().ok, true)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), true)
})

test('start_game: 참가자 중 한 명이 이미 다른 GameSession에 속해 있으면 새 Room 전체가 PLAYER_ALREADY_IN_SESSION으로 거부된다', async () => {
    const newHost = createFakeSocket('uuid-pais-new-host')
    const io = createFakeIo([newHost])
    const { joinerSocket: sharedSocket, room } = await setupReadyRoomForStart(
        io, 'uuid-pais-new-host', 'uuid-pais-shared', readyRoomHandlers,
    )
    const prepared = gameSession.prepareGameSession({
        id: 'uuid-pais-existing-game',
        players: new Map([
            ['uuid-pais-shared', { uuid: 'uuid-pais-shared', nickname: 'shared', isReady: true }],
            ['uuid-pais-existing-peer', { uuid: 'uuid-pais-existing-peer', nickname: 'peer', isReady: true }],
        ]),
        settings: { jokerCount: 1 },
    })
    assert.equal(prepared.ok, true)
    gameSession.commitGameSession(prepared.session)

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, newHost, 'uuid-pais-new-host', startPayload(room), callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PLAYER_ALREADY_IN_SESSION')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 성공 후 같은 uuid로 get_current_room을 조회하면 room:null이 온다', async () => {
    const hostSocket = createFakeSocket('uuid-gcr-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-gcr-host', 'uuid-gcr-joiner', readyRoomHandlers)

    const startResult = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-gcr-host', startPayload(room))
    assert.equal(startResult.ok, true)

    const current = await callAsPromise(handleGetCurrentRoom, 'uuid-gcr-host')
    assert.equal(current.room, null)
})

test('start_game: 게임 시작 후 공개방 목록에 그 방이 더 이상 없다', async () => {
    const hostSocket = createFakeSocket('uuid-list-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-list-host', 'uuid-list-joiner', readyRoomHandlers)

    const startResult = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-list-host', startPayload(room))
    assert.equal(startResult.ok, true)

    const list = await callAsPromise(handleGetPublicRooms)
    assert.equal(list.rooms.some((r) => r.id === room.roomId), false)
})

test('AC-07: disconnect 직후 get_current_room은 여전히 이전 room ID를 반환한다', async () => {
    const socket = createFakeSocket('uuid-refresh')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-refresh', validSettingsPayload())

    matchmaking.onDisconnect(io, socket, 'uuid-refresh')

    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-refresh')
    assert.equal(res.ok, true)
    assert.equal(res.room.roomId, created.room.roomId, '새로고침 직후 조회가 이전 방을 잃어버렸습니다')
    assert.equal(res.room.roomCode, created.room.roomCode)
})

test('AC-07: 재조회로 복구가 확인되면 유예 예약이 취소되어 만료로도 방에서 빠지지 않는다', async () => {
    const socket = createFakeSocket('uuid-refresh-keep')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-refresh-keep', validSettingsPayload())

    matchmaking.onDisconnect(io, socket, 'uuid-refresh-keep')
    assert.deepEqual(
        matchmaking.__getPendingRoomRemovalsForTests(),
        [['uuid-refresh-keep', created.room.roomId]],
        'disconnect가 유예를 예약하지 않았습니다',
    )

    await callAsPromise(handleGetCurrentRoom, 'uuid-refresh-keep')
    assert.deepEqual(matchmaking.__getPendingRoomRemovalsForTests(), [], '확인 후에도 예약이 남아있습니다')

    matchmaking.__flushRoomRetentionForTests()
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([u]) => u === 'uuid-refresh-keep'), true)
    assert.equal(snapshot.gameRooms.some(([id]) => id === created.room.roomId), true)
})

test('AC-07: 재조회가 없는 채로 유예가 끝나면 예전처럼 방에서 제거된다', async () => {
    const host = createFakeSocket('uuid-grace-host')
    const io = createFakeIo([host])
    const created = await callAsPromise(handleCreateRoom, io, host, 'uuid-grace-host', validSettingsPayload())
    const joiner = createFakeSocket('uuid-grace-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-grace-joiner', created.room.roomCode)

    matchmaking.onDisconnect(io, joiner, 'uuid-grace-joiner')
    matchmaking.__flushRoomRetentionForTests()

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([u]) => u === 'uuid-grace-joiner'), false)
    assert.equal(io.broadcasts.some((b) => b.event === 'player_left_room'), true)
})

test('AC-07: 재접속한 새 소켓은 원래 방 채널에 다시 가입되고 activeRoomId가 결합된다', async () => {
    const socket = createFakeSocket('uuid-rejoin')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-rejoin', validSettingsPayload())

    matchmaking.onDisconnect(io, socket, 'uuid-rejoin')

    const freshSocket = createFakeSocket('uuid-rejoin', { id: 'sock-uuid-rejoin-2' })
    io.sockets.sockets.set(freshSocket.id, freshSocket)
    await matchmaking.resyncRoomChannelOnReconnect(freshSocket, 'uuid-rejoin')

    assert.equal(freshSocket.rooms.has(created.room.roomId), true)
    assert.equal(freshSocket.data.activeRoomId, created.room.roomId)
})

test('AC-07: 방에 속하지 않은 소켓의 재접속은 어떤 채널에도 가입시키지 않는다', async () => {
    const stranger = createFakeSocket('uuid-no-room')
    await matchmaking.resyncRoomChannelOnReconnect(stranger, 'uuid-no-room')

    assert.deepEqual(stranger.joined, [])
    assert.equal(stranger.data.activeRoomId, undefined)
})

test('AC-07: 재접속했지만 대기방으로 돌아오지 않으면 유예 만료 시 채널에서도 정리된다', async () => {
    const host = createFakeSocket('uuid-lobby-host')
    const io = createFakeIo([host])
    const created = await callAsPromise(handleCreateRoom, io, host, 'uuid-lobby-host', validSettingsPayload())
    const joiner = createFakeSocket('uuid-lobby-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-lobby-joiner', created.room.roomCode)

    matchmaking.onDisconnect(io, joiner, 'uuid-lobby-joiner')
    io.sockets.sockets.delete(joiner.id)

    const freshSocket = createFakeSocket('uuid-lobby-joiner', { id: 'sock-lobby-joiner-2' })
    io.sockets.sockets.set(freshSocket.id, freshSocket)
    await matchmaking.resyncRoomChannelOnReconnect(freshSocket, 'uuid-lobby-joiner')
    assert.equal(freshSocket.rooms.has(created.room.roomId), true)

    matchmaking.__flushRoomRetentionForTests()
    await Promise.resolve()

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([u]) => u === 'uuid-lobby-joiner'), false)
    assert.equal(freshSocket.rooms.has(created.room.roomId), false, '살아있는 소켓이 방 채널에 남았습니다')
})

test('AC-07: 유예 중 방이 이미 사라졌다면 만료가 뒤늦은 방송을 만들지 않는다', async () => {
    const host = createFakeSocket('uuid-stale-grace-host')
    const io = createFakeIo([host])
    const created = await callAsPromise(handleCreateRoom, io, host, 'uuid-stale-grace-host', validSettingsPayload())
    const joiner = createFakeSocket('uuid-stale-grace-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-stale-grace-joiner', created.room.roomCode)

    matchmaking.onDisconnect(io, joiner, 'uuid-stale-grace-joiner')

    const { handleDeleteRoom } = matchmaking.__testables
    handleDeleteRoom(io, 'uuid-stale-grace-host')

    io.broadcasts.length = 0
    matchmaking.__flushRoomRetentionForTests()

    assert.equal(io.broadcasts.length, 0, '이미 사라진 방에 대해 뒤늦은 방송이 나갔습니다')
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.some(([id]) => id === created.room.roomId), false)
})


for (const failureStage of ['preflight', 'payload']) {
    test('F14 private loadouts never enter public room after ' + failureStage + ' failure', async (t) => {
        const hostId = 'uuid-private-host'
        const guestId = 'uuid-private-guest'
        const host = createFakeSocket(hostId)
        const io = createFakeIo([host])
        const { joinerSocket, room } = await setupReadyRoomForStart(io, hostId, guestId, readyRoomHandlers)
        const before = JSON.parse(JSON.stringify(await callAsPromise(handleGetCurrentRoom, hostId)))
        fakeGetGameStartLoadouts = async (ids) => Object.fromEntries(ids.map((id) => [id, {
            profilePhotoId: 'player-profile-드워프', profileBorderId: 'profile-border-귀족',
            cardFrameId: 'player-card-시험용',
            skinsByJob: Object.fromEntries(Object.values(ROLE_TO_SKIN_JOB_ID).map((job) => [job, id + '-private-' + job])),
        }]))
        if (failureStage === 'preflight') joinerSocket.connected = false
        else t.mock.method(gameSession, 'buildGameStartedPayload', () => { throw new Error('injected payload failure') })
        const failed = await callAsPromise(handleStartGame, io, host, hostId, startPayload(room))
        assert.equal(failed.ok, false)
        assert.equal(failed.code, failureStage === 'preflight' ? 'PARTICIPANT_UNAVAILABLE' : 'INTERNAL_ERROR')
        for (const id of [hostId, guestId]) {
            const current = await callAsPromise(handleGetCurrentRoom, id)
            for (const player of current.room.players) {
                assert.equal(Object.hasOwn(player, 'accountSkinsByJob'), false, 'private job map must never reach get_current_room')
                assert.equal(Object.hasOwn(player, 'accountSkinId'), false)
            }
            assert.deepEqual(current, before, 'failed start leaves the original public room unchanged')
        }
        assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
        joinerSocket.connected = true
        t.mock.restoreAll()
        const retried = await callAsPromise(handleStartGame, io, host, hostId, startPayload(room))
        assert.equal(retried.ok, true)
        for (const socket of [host, joinerSocket]) {
            const state = socket.emitted.find((event) => event.event === 'game_started').payload.state
            assert.equal(state.self.accountSkinId, state.self.uuid + '-private-' + ROLE_TO_SKIN_JOB_ID[state.self.role])
            for (const player of state.players) {
                assert.equal(Object.hasOwn(player, 'accountSkinsByJob'), false)
                assert.equal(Object.hasOwn(player, 'accountSkinId'), false)
                assert.equal(player.accountCardFrameId, 'player-card-시험용')
            }
        }
    })
}
