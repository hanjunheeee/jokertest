const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../matchmaking')
matchmaking.__setUserRepositoryForTests({
    findByUuid: async (uuid) => ({ nickname: `user-${uuid}` }),
})

const {
    handleCreateRoom,
    handleGetPublicRooms,
    handleJoinPublicRoom,
    handleDeleteRoom,
} = matchmaking.__testables

function callAsPromise(handler, ...args) {
    return new Promise((resolve) => handler(...args, resolve))
}

function createFakeSocket(uuid) {
    return {
        id: `socket-${uuid}`,
        data: { user: { uuid } },
        connected: true,
        emitted: [],
        joined: [],
        left: [],
        async join(roomId) { this.joined.push(roomId) },
        async leave(roomId) { this.left.push(roomId) },
        emit(event, payload) { this.emitted.push({ event, payload }) },
        to(roomId) {
            return { emit: (event, payload) => this.emitted.push({ event, payload, broadcastTo: roomId }) }
        },
    }
}

function createFakeIo(sockets) {
    const emitted = []
    return {
        sockets: { sockets: new Map(sockets.map((socket) => [socket.id, socket])) },
        emitted,
        emit(event, payload) { emitted.push({ event, payload }) },
        to() { return { emit() {} } },
    }
}

function settings(accessType) {
    return {
        accessType,
        maxPlayers: 8,
        jokerCount: 2,
        lightsOut: false,
        soulBetting: false,
        dayDiscussionTime: 60,
        dayVoteTime: 60,
        nightActionTime: 90,
        voteReveal: true,
    }
}

test.beforeEach(() => matchmaking.__resetStateForTests())

test('방 목록은 open/code 방을 모두 반환하고 핵심 내부 정보는 노출하지 않는다', async () => {
    const openHost = createFakeSocket('open-host')
    const codeHost = createFakeSocket('code-host')
    const io = createFakeIo([openHost, codeHost])

    const openResult = await callAsPromise(handleCreateRoom, io, openHost, 'open-host', settings('open'))
    const codeResult = await callAsPromise(handleCreateRoom, io, codeHost, 'code-host', settings('code'))

    const result = await callAsPromise(handleGetPublicRooms)

    assert.equal(result.ok, true)
    assert.equal(result.rooms.length, 2)
    assert.deepEqual(
        result.rooms.map(({ id, accessType }) => ({ id, accessType })),
        [
            { id: openResult.room.roomId, accessType: 'open' },
            { id: codeResult.room.roomId, accessType: 'code' },
        ],
    )

    for (const room of result.rooms) {
        assert.equal(Object.hasOwn(room, 'roomCode'), false)
        assert.equal(Object.hasOwn(room, 'players'), false)
        assert.equal(Object.hasOwn(room, 'hostUuid'), false)
        assert.equal(Object.hasOwn(room, 'socketId'), false)
        assert.equal(Object.hasOwn(room, 'stage'), false)
        // 준비 상태·시작 가능 여부는 참가자 전용 정보라 공개 목록에는 노출하지 않는다(확정 사항).
        assert.equal(Object.hasOwn(room, 'isReady'), false)
        assert.equal(Object.hasOwn(room, 'canStart'), false)
    }
})

test('join_public_room은 code 방 직접 입장을 서버에서 거부한다', async () => {
    const codeHost = createFakeSocket('guard-code-host')
    const joiner = createFakeSocket('guard-code-joiner')
    const io = createFakeIo([codeHost, joiner])
    const codeResult = await callAsPromise(
        handleCreateRoom, io, codeHost, 'guard-code-host', settings('code'),
    )

    await handleJoinPublicRoom(io, joiner, 'guard-code-joiner', { roomId: codeResult.room.roomId })

    assert.ok(joiner.emitted.find((entry) => entry.event === 'room_join_failed'))
    assert.equal(joiner.joined.length, 0)
    assert.equal(matchmaking.__getStateSnapshotForTests().playerRoom.some(
        ([uuid]) => uuid === 'guard-code-joiner',
    ), false)
})

test('join_public_room은 open 방에 참가시키고 실시간 목록 인원을 갱신한다', async () => {
    const openHost = createFakeSocket('public-open-host')
    const joiner = createFakeSocket('public-joiner')
    const io = createFakeIo([openHost, joiner])

    const openResult = await callAsPromise(
        handleCreateRoom, io, openHost, 'public-open-host', settings('open'),
    )
    await handleJoinPublicRoom(io, joiner, 'public-joiner', { roomId: openResult.room.roomId })

    const joinedEvent = joiner.emitted.find((entry) => entry.event === 'room_joined')
    assert.ok(joinedEvent)
    assert.equal(joinedEvent.payload.players.length, 2)
    assert.equal(Object.hasOwn(joinedEvent.payload, 'roomCode'), true)
    // 참가 응답에는 준비 상태·시작 가능 여부가 포함되어야 한다(공개 목록과는 다른 계약).
    assert.ok(joinedEvent.payload.players.every((player) => typeof player.isReady === 'boolean'))
    assert.equal(typeof joinedEvent.payload.canStart, 'boolean')
    assert.equal(io.emitted.at(-1).event, 'public_rooms_updated')
    assert.equal(io.emitted.at(-1).payload.rooms[0].current, 2)
})

test('방 목록 status는 현재 인원이 정원에 도달하면 full로 계산된다', async () => {
    const host = createFakeSocket('full-host')
    const joiners = ['full-2', 'full-3', 'full-4'].map(createFakeSocket)
    const io = createFakeIo([host, ...joiners])
    const created = await callAsPromise(
        handleCreateRoom,
        io,
        host,
        'full-host',
        { ...settings('open'), maxPlayers: 4 },
    )

    for (const joiner of joiners) {
        await handleJoinPublicRoom(io, joiner, joiner.data.user.uuid, { roomId: created.room.roomId })
    }

    const result = await callAsPromise(handleGetPublicRooms)
    assert.equal(result.rooms[0].current, 4)
    assert.equal(result.rooms[0].max, 4)
    assert.equal(result.rooms[0].status, 'full')
})

test('join_public_room: 잘못된 형태의 payload는 구조분해 예외 없이 명시적으로 거부한다', async () => {
    // null/문자열/배열/roomId 없는 객체 각각에 대해 예외 없이 room_join_failed만 응답해야 한다.
    const cases = [null, 'not-an-object', [], {}, { roomId: 123 }, { roomId: '' }]

    for (const payload of cases) {
        const joiner = createFakeSocket(`invalid-payload-${JSON.stringify(payload)}`)
        const io = createFakeIo([joiner])

        await assert.doesNotReject(() => handleJoinPublicRoom(io, joiner, joiner.data.user.uuid, payload))

        assert.ok(joiner.emitted.find((entry) => entry.event === 'room_join_failed'))
        assert.equal(joiner.joined.length, 0)
    }
})

test('방 삭제 후 public_rooms_updated 방송에서 해당 방이 사라진다', async () => {
    const host = createFakeSocket('delete-broadcast-host')
    const io = createFakeIo([host])
    const created = await callAsPromise(handleCreateRoom, io, host, 'delete-broadcast-host', settings('open'))

    io.emitted.length = 0 // 생성 시점 방송은 이번 검증과 무관하므로 비워둔다
    handleDeleteRoom(io, 'delete-broadcast-host')

    const broadcast = io.emitted.find((entry) => entry.event === 'public_rooms_updated')
    assert.ok(broadcast, '방 삭제 후 목록 방송이 있어야 합니다')
    assert.equal(broadcast.payload.rooms.some((room) => room.id === created.room.roomId), false)
})

test('참가자 disconnect 후 public_rooms_updated 방송에 인원 감소가 반영된다', async () => {
    const host = createFakeSocket('disconnect-broadcast-host')
    const joiner = createFakeSocket('disconnect-broadcast-joiner')
    const io = createFakeIo([host, joiner])
    const created = await callAsPromise(
        handleCreateRoom, io, host, 'disconnect-broadcast-host', settings('open'),
    )
    await handleJoinPublicRoom(io, joiner, 'disconnect-broadcast-joiner', { roomId: created.room.roomId })

    io.emitted.length = 0
    matchmaking.onDisconnect(io, 'disconnect-broadcast-joiner')

    const broadcast = io.emitted.find((entry) => entry.event === 'public_rooms_updated')
    assert.ok(broadcast, 'disconnect 후 목록 방송이 있어야 합니다')
    const room = broadcast.payload.rooms.find((r) => r.id === created.room.roomId)
    assert.equal(room.current, 1) // host만 남음
})

test('public_rooms_updated로 방송되는 모든 방 DTO에는 roomCode/players/hostUuid/socketId가 없다', async () => {
    const host = createFakeSocket('dto-broadcast-host')
    const io = createFakeIo([host])
    await callAsPromise(handleCreateRoom, io, host, 'dto-broadcast-host', settings('open'))

    const broadcast = io.emitted.find((entry) => entry.event === 'public_rooms_updated')
    assert.ok(broadcast)
    assert.ok(broadcast.payload.rooms.length > 0)
    for (const room of broadcast.payload.rooms) {
        assert.equal(Object.hasOwn(room, 'roomCode'), false)
        assert.equal(Object.hasOwn(room, 'players'), false)
        assert.equal(Object.hasOwn(room, 'hostUuid'), false)
        assert.equal(Object.hasOwn(room, 'socketId'), false)
        assert.equal(Object.hasOwn(room, 'isReady'), false)
        assert.equal(Object.hasOwn(room, 'canStart'), false)
    }
})
