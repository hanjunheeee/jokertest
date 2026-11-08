// 대기방 정리 버그 시험 (2026-11-09 버그 수정)
// 빈 방 정리 통일(1-11)·다음 방 우편함(1-5)·판 끝 정리가 파티 방 사람 빼기(1-16)·BE-005/026/029/033·입장 답 코드
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionCore = require('../../game-core/gameSession')
const gameSessionSocketLayer = require('../../socket/gameSession')
const matchmaking = require('../../socket/matchmaking')
const { ROOM_JOIN_ERROR_CODES } = require('../../socket/roomJoinErrors')
const { rememberStartedRoom } = require('../../socket/matchmaking/join/startedMarks')
const { roomAdmissionAttempts, generationByUuid } = require('../../socket/matchmaking/core/state')
const { invalidateRoomAttempts, getAdmissionAttempt } = require('../../socket/matchmaking/admission/attempts')
const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    seedActiveGameForAccount,
} = require('../helpers/matchmakingFixtures')

const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleJoinPublicRoom,
    handleGetCurrentRoom,
    handleGetPartyMatchingRoom,
    handleDeleteRoom,
} = matchmaking.__testables

// 초대 서비스 가짜: 부른 기록만 남김 (개발 DB에 안 붙게)
const inviteCalls = { cancelled: [], interrupted: [] }
const fakeInviteService = {
    async cancelPendingInvitesForRoom(roomId, reason) { inviteCalls.cancelled.push({ roomId, reason }) },
    async recordEntryInterrupted(entry) { inviteCalls.interrupted.push(entry) },
}

// 조건 맞을 때까지 미뤄진 일 비우기 (실제 시간 안 기다림)
async function waitUntil(condition, rounds = 200) {
    for (let i = 0; i < rounds; i += 1) {
        if (condition()) return
        await new Promise((resolve) => setImmediate(resolve))
    }
}

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    inviteCalls.cancelled.length = 0
    inviteCalls.interrupted.length = 0
    matchmaking.__setGameInviteServiceForTests(fakeInviteService)
    matchmaking.setOnlineUsersRegistry(null)
    matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: `nick-${uuid}` }) })
    matchmaking.__setEconomyServiceForTests({
        async getPublicProfileLoadouts(ids) {
            return Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]))
        },
    })
    matchmaking.__setGameResultRepositoryForTests({
        getAccountRecordSummaries: async (ids) => new Map(ids.map((id) => [id, { totalGames: 0, winRate: 0 }])),
    })
})

test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    matchmaking.__setGameInviteServiceForTests(null)
    matchmaking.__setUserRepositoryForTests(null)
    matchmaking.__setEconomyServiceForTests(null)
    matchmaking.__setGameResultRepositoryForTests(null)
})

// 끝난 판 만들기 (첫 사람이 판 방장)
function seedEndedGame(uuids) {
    const session = seedActiveGameForAccount(uuids)
    session.hostUuid = uuids[0]
    session.phase = 'ENDED'
    session.winResult = { winner: 'CITIZEN' }
    return session
}

function addSocket(io, uuid) {
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)
    return socket
}

test('1-11: 판 끝 정리로 빈 방이 되면 그 방 입장 시도도 없어지고 대기 초대도 취소된다', async () => {
    const io = createFakeIo()
    const host = addSocket(io, 'c-host')
    const created = await callAsPromise(handleCreateRoom, io, host, 'c-host', validSettingsPayload())
    assert.equal(created.ok, true)
    const roomId = created.room.roomId
    matchmaking.__seedAdmissionAttemptForTests('c-invited', { roomId, inviteId: 'inv-1', phase: 'reserved' })

    matchmaking.cleanupRoomStateForSessionParticipants(io, ['c-host'])
    await waitUntil(() => inviteCalls.cancelled.length > 0 && inviteCalls.interrupted.length > 0)

    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.length, 0)
    assert.equal(roomAdmissionAttempts.has('c-invited'), false, '없어진 방을 가리키는 입장 시도가 남으면 안 됨')
    assert.deepEqual(inviteCalls.cancelled, [{ roomId, reason: 'ROOM_GONE' }])
    assert.equal(inviteCalls.interrupted.length, 1)
    assert.equal(inviteCalls.interrupted[0].inviteId, 'inv-1')
})

test('1-5: 방장이 다음 방을 지우면 우편함도 비어 끝난 판 사람이 없어진 방을 받지 않는다', async () => {
    const io = createFakeIo()
    const ended = seedEndedGame(['p-host', 'p-guest'])
    const host = addSocket(io, 'p-host')
    const created = await callAsPromise(handleCreateRoom, io, host, 'p-host', validSettingsPayload())
    assert.equal(created.ok, true)

    const before = await callAsPromise(handleGetPartyMatchingRoom, 'p-guest', { gameId: ended.id })
    assert.equal(before.room?.roomId, created.room.roomId, '전제: 우편함에 다음 방이 있음')

    handleDeleteRoom(io, 'p-host')

    const after = await callAsPromise(handleGetPartyMatchingRoom, 'p-guest', { gameId: ended.id })
    assert.equal(after.ok, true)
    assert.equal(after.room, null, '지운 방을 우편함이 계속 돌려주면 안 됨')
})

test('1-5: 우편함은 넣을 때 찍은 옛 명단 말고 지금 명단을 돌려준다', async () => {
    const io = createFakeIo()
    const ended = seedEndedGame(['q-host', 'q-guest'])
    const host = addSocket(io, 'q-host')
    const created = await callAsPromise(handleCreateRoom, io, host, 'q-host', validSettingsPayload())
    const outsider = addSocket(io, 'q-outsider')
    await handleJoinRoomByCode(io, outsider, 'q-outsider', created.room.roomCode)

    const lookup = await callAsPromise(handleGetPartyMatchingRoom, 'q-guest', { gameId: ended.id })
    assert.deepEqual(lookup.room.players.map((p) => p.uuid).sort(), ['q-host', 'q-outsider'])
})

test('1-16: 판 끝 정리는 결과 화면에서 스스로 다음 방으로 옮긴 사람을 그 방에서 빼지 않는다', async () => {
    const io = createFakeIo()
    seedEndedGame(['s-host', 's-guest', 's-late'])
    const host = addSocket(io, 's-host')
    const created = await callAsPromise(handleCreateRoom, io, host, 's-host', validSettingsPayload())
    assert.equal(created.ok, true)
    // 자동 입장 때 연결이 없던 사람이 나중에 스스로 코드로 들어옴
    const late = addSocket(io, 's-late')
    await handleJoinRoomByCode(io, late, 's-late', created.room.roomCode)

    // 마지막 사람이 끊겨 판 끝 정리가 남은 사람 전부를 넘김
    matchmaking.cleanupRoomStateForSessionParticipants(io, ['s-host', 's-guest', 's-late'])

    const hostRoom = await callAsPromise(handleGetCurrentRoom, 's-host')
    const lateRoom = await callAsPromise(handleGetCurrentRoom, 's-late')
    assert.equal(hostRoom.room?.roomId, created.room.roomId, '스스로 방을 만든 방장이 쫓겨나면 안 됨')
    assert.equal(lateRoom.room?.roomId, created.room.roomId, '스스로 들어온 사람이 쫓겨나면 안 됨')
})

test('1-16: 결과 화면에서 시작한 방 만들기는 판 끝 정리가 끼어도 실패하지 않는다', async () => {
    const io = createFakeIo()
    seedEndedGame(['g-host', 'g-guest'])
    const host = addSocket(io, 'g-host')
    let releaseLookup
    const gate = new Promise((resolve) => { releaseLookup = resolve })
    matchmaking.__setUserRepositoryForTests({
        findByUuid: async (uuid) => { await gate; return { uuid, nickname: `nick-${uuid}` } },
    })
    const pending = callAsPromise(handleCreateRoom, io, host, 'g-host', validSettingsPayload())
    matchmaking.cleanupRoomStateForSessionParticipants(io, ['g-host', 'g-guest'])
    releaseLookup()
    const created = await pending
    assert.equal(created.ok, true, '정상 다음 방 만들기가 세대 번호 때문에 실패하면 안 됨')
})

test('BE-033: 처리 중 요청이 없으면 판 끝 정리가 세대 번호 칸을 지운다', () => {
    const io = createFakeIo()
    matchmaking.cleanupRoomStateForSessionParticipants(io, ['idle-a', 'idle-b'])
    assert.equal(generationByUuid.has('idle-a'), false)
    assert.equal(generationByUuid.has('idle-b'), false)
})

test('BE-005: 판 방장이 아닌 참가자가 만든 방에는 남을 끌고 가지 않고 우편함도 안 덮는다', async () => {
    const io = createFakeIo()
    const ended = seedEndedGame(['n-host', 'n-guest', 'n-other'])
    addSocket(io, 'n-host')
    addSocket(io, 'n-other')
    const guest = addSocket(io, 'n-guest')

    const created = await callAsPromise(handleCreateRoom, io, guest, 'n-guest', validSettingsPayload())
    assert.equal(created.ok, true)
    await waitUntil(() => false, 20)

    const hostRoom = await callAsPromise(handleGetCurrentRoom, 'n-host')
    const otherRoom = await callAsPromise(handleGetCurrentRoom, 'n-other')
    assert.equal(hostRoom.room, null, '판 방장이 참가자 방에 끌려가면 안 됨')
    assert.equal(otherRoom.room, null, '다른 참가자가 끌려가면 안 됨')
    const lookup = await callAsPromise(handleGetPartyMatchingRoom, 'n-other', { gameId: ended.id })
    assert.equal(lookup.room, null, '참가자가 만든 방이 우편함에 들어가면 안 됨')
})

test('BE-029: 다음 방 정원보다 판 사람이 많으면 넘친 사람에게 실패 알림 없이 건너뛴다', async () => {
    const io = createFakeIo()
    const uuids = ['o-host', 'o-1', 'o-2', 'o-3', 'o-4', 'o-5', 'o-6']
    seedEndedGame(uuids)
    const sockets = uuids.map((uuid) => addSocket(io, uuid))
    const created = await callAsPromise(
        handleCreateRoom, io, sockets[0], 'o-host', validSettingsPayload({ maxPlayers: 5, jokerCount: 1 }),
    )
    assert.equal(created.ok, true)
    await waitUntil(() => matchmaking.__getStateSnapshotForTests().playerRoom.length >= 5)
    await waitUntil(() => false, 20)

    assert.equal(matchmaking.__getStateSnapshotForTests().playerRoom.length, 5)
    const failed = sockets.flatMap((s) => s.emitted.filter((e) => e.event === 'room_join_failed'))
    assert.deepEqual(failed, [], '자동 입장이 넘친 사람에게 "방이 가득 찼습니다"를 띄우면 안 됨')
})

test('BE-026: 방 지우기는 답을 주고 남은 사람 소켓을 방 채널에서 뗀다', async () => {
    const io = createFakeIo()
    const host = addSocket(io, 'd-host')
    const created = await callAsPromise(handleCreateRoom, io, host, 'd-host', validSettingsPayload())
    const guest = addSocket(io, 'd-guest')
    await handleJoinRoomByCode(io, guest, 'd-guest', created.room.roomCode)
    const roomId = created.room.roomId
    assert.equal(guest.rooms.has(roomId), true)

    let answer = null
    handleDeleteRoom(io, 'd-host', { socket: host, callback: (res) => { answer = res } })

    assert.deepEqual(answer, { ok: true, roomId })
    assert.equal(guest.rooms.has(roomId), false, '없어진 방 채널에 남은 사람 소켓이 붙어 있으면 안 됨')
    assert.equal(guest.data.activeRoomId, undefined)
    assert.ok(guest.emitted.some((e) => e.event === 'room_deleted'))
})

test('BE-026: 새 탭에 밀린 옛 소켓의 방 지우기는 거절된다', async () => {
    const io = createFakeIo()
    const host = addSocket(io, 'e-host')
    const created = await callAsPromise(handleCreateRoom, io, host, 'e-host', validSettingsPayload())

    let answer = null
    handleDeleteRoom(io, 'e-host', {
        socket: host,
        callback: (res) => { answer = res },
        getCurrentSocketId: () => 'sock-new-tab',
    })

    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'STALE_SOCKET')
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms[0]?.[0], created.room.roomId)
})

test('입장 답 코드: 시작돼 사라진 방은 공개 방 입장도 판이 끝났으면 SESSION_ENDED', () => {
    const io = createFakeIo()
    const socket = addSocket(io, 'v-joiner')
    rememberStartedRoom({ id: 'room-vanished', code: 'ZZZ999' })

    return handleJoinPublicRoom(io, socket, 'v-joiner', { roomId: 'room-vanished' }).then(() => {
        const failed = socket.emitted.find((e) => e.event === 'room_join_failed')
        assert.equal(failed.payload.code, ROOM_JOIN_ERROR_CODES.SESSION_ENDED)
    })
})

test('입장 답 코드: 시작돼 진행 중인 판의 방은 코드·공개 방 어느 길이든 ROOM_ALREADY_STARTED', async () => {
    const io = createFakeIo()
    const session = seedActiveGameForAccount(['live-a', 'live-b'], { roomId: 'room-live' })
    session.roomCode = 'LIV111'
    session.roomId = 'room-live'
    rememberStartedRoom({ id: 'room-live', code: 'LIV111' })

    const byPublic = addSocket(io, 'w-public')
    await handleJoinPublicRoom(io, byPublic, 'w-public', { roomId: 'room-live' })
    const byCode = addSocket(io, 'w-code')
    await handleJoinRoomByCode(io, byCode, 'w-code', 'LIV111', { roomId: 'room-live', accessType: 'code' })

    const codeOf = (s) => s.emitted.find((e) => e.event === 'room_join_failed')?.payload.code
    assert.equal(codeOf(byPublic), ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED)
    assert.equal(codeOf(byCode), ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED)
})

test('코드 입장: 명단에 넣은 뒤 알림이 던져도 실패 알림을 보내지 않는다 (명단과 화면 어긋남 막기)', async () => {
    const io = createFakeIo()
    const host = addSocket(io, 'k-host')
    const created = await callAsPromise(handleCreateRoom, io, host, 'k-host', validSettingsPayload())
    const joiner = createFakeSocket('k-joiner', { emitShouldThrowOn: 'room_joined' })
    io.sockets.sockets.set(joiner.id, joiner)

    await handleJoinRoomByCode(io, joiner, 'k-joiner', created.room.roomCode)

    const current = await callAsPromise(handleGetCurrentRoom, 'k-joiner')
    assert.equal(current.room?.roomId, created.room.roomId)
    assert.equal(joiner.emitted.some((e) => e.event === 'room_join_failed'), false)
    assert.ok(host.emitted.some((e) => e.event === 'player_joined_room'), '방 사람들 알림은 그대로 가야 함')
})

test('방 만들기: 방장 답장이 던져도 끝난 판 사람들 다음 방 알림은 간다', async () => {
    const io = createFakeIo()
    seedEndedGame(['a-host', 'a-guest'])
    const host = addSocket(io, 'a-host')
    const guest = addSocket(io, 'a-guest')
    guest.connected = false

    await new Promise((resolve) => {
        handleCreateRoom(io, host, 'a-host', validSettingsPayload(), () => {
            setImmediate(resolve)
            throw new Error('ack 실패(시험 주입)')
        })
    })

    const lookup = await callAsPromise(handleGetPartyMatchingRoom, 'a-guest', {})
    assert.ok(lookup.room, '답장이 던져도 우편함에 다음 방이 들어가야 함')
})

test('BE-026 등: 방 없애기가 입장 시도에 없앤 표시를 남겨 수락 흐름이 두 번 중단 기록하지 않는다', () => {
    const attempt = { accountUuid: 'x', roomId: 'room-x', inviteId: null, phase: 'reserved', expiresAt: Date.now() + 10000 }
    roomAdmissionAttempts.set('x', attempt)
    invalidateRoomAttempts('room-x', 'ROOM_DELETED')
    assert.equal(attempt.invalidated, 'ROOM_DELETED')
})

test('입장 시도 기한이 지나 지울 때도 초대에 중단 기록을 남긴다', async () => {
    roomAdmissionAttempts.set('y', {
        accountUuid: 'y', attemptId: 'adm-y', roomId: 'room-y', inviteId: 'inv-y',
        phase: 'reserved', expiresAt: Date.now() - 1,
    })
    assert.equal(getAdmissionAttempt('y'), null)
    await waitUntil(() => inviteCalls.interrupted.length > 0)
    assert.deepEqual(inviteCalls.interrupted, [{ inviteId: 'inv-y', attemptId: 'adm-y', reason: 'EXPIRED' }])
})
