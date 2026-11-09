// 강퇴 뒤 다시 들어오기 규칙 시험 (사용자 결정 2026-11-09, 브라우저 시험 room R-1)
// 1·2번째 강퇴 뒤엔 다시 들어옴, 같은 방 3번째 강퇴부터 그 방 못 들어옴, 방 없어지면 기록도 없어짐
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../../socket/matchmaking')
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (userIds) =>
        new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }])),
})
const gameSessionSocketLayer = require('../../socket/gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../../socket/roomJoinErrors')

const {
    createFakeSocket,
    createFakeIo,
    callAsPromise,
    validSettingsPayload,
    countingCallback,
} = require('../helpers/matchmakingFixtures')

const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleKickRoomPlayer,
} = matchmaking.__testables

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: `nick-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getEmojiPalette: async () => ({ slots: Array(8).fill(null), owned: [] }),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const registry = () => new Proxy(new Map(), {
    get(target, prop, receiver) {
        if (prop === 'get') return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
        return Reflect.get(target, prop, receiver)
    },
})

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(registry())
})

test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
})

let seq = 0
const current = (uuid) => callAsPromise(handleGetCurrentRoom, uuid)

async function setup(hostUuid, guestUuid) {
    const hostSocket = createFakeSocket(hostUuid)
    const guestSocket = createFakeSocket(guestUuid)
    const io = createFakeIo([hostSocket, guestSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload({ maxPlayers: 8, jokerCount: 1 }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))
    return { io, hostSocket, guestSocket, roomCode: created.room.roomCode }
}

// 손님 코드 입장 → 마지막 입장 결과 사건 (room_joined / room_join_failed)
async function join(io, socket, uuid, roomCode) {
    socket.emitted.length = 0
    await handleJoinRoomByCode(io, socket, uuid, roomCode)
    return socket.emitted.find((e) => e.event === 'room_joined' || e.event === 'room_join_failed')
}

async function kick(io, hostSocket, hostUuid, targetUuid) {
    const { room } = await current(hostUuid)
    const seat = (uuid) => room.players.find((p) => p.uuid === uuid).membershipId
    seq += 1
    const { callback, getResponse } = countingCallback()
    handleKickRoomPlayer(io, hostSocket, hostUuid, {
        requestId: `kick-limit-${seq}`, bootEpoch: room.bootEpoch, roomId: room.roomId,
        roomInstanceId: room.roomInstanceId, requesterMembershipId: seat(hostUuid),
        targetUuid, targetMembershipId: seat(targetUuid),
    }, callback, (uuid) => `sock-${uuid}`)
    const response = getResponse()
    assert.equal(response.ok, true, JSON.stringify(response))
}

test('1·2번째 강퇴 뒤엔 같은 코드로 다시 들어오고, 3번째 강퇴 뒤엔 거절 코드 + 안내 문구', async () => {
    const { io, hostSocket, guestSocket, roomCode } = await setup('lh-1', 'lg-1')

    for (let round = 1; round <= 2; round += 1) {
        assert.equal((await join(io, guestSocket, 'lg-1', roomCode))?.event, 'room_joined', `입장 ${round}`)
        await kick(io, hostSocket, 'lh-1', 'lg-1')
        assert.equal((await current('lg-1')).room, null)
    }
    assert.equal((await join(io, guestSocket, 'lg-1', roomCode))?.event, 'room_joined', '2번 강퇴 뒤에도 들어옴')
    await kick(io, hostSocket, 'lh-1', 'lg-1')

    const refused = await join(io, guestSocket, 'lg-1', roomCode)
    assert.equal(refused?.event, 'room_join_failed')
    assert.equal(refused.payload.code, ROOM_JOIN_ERROR_CODES.KICKED_TOO_MANY_TIMES)
    assert.match(refused.payload.message, /3번 추방/)
    assert.equal((await current('lg-1')).room, null)
    // 방엔 방장만
    assert.equal((await current('lh-1')).room.players.length, 1)
})

test('다른 사람은 그 방에 그대로 들어옴 (막는 건 3번 쫓겨난 사람만)', async () => {
    const { io, hostSocket, guestSocket, roomCode } = await setup('lh-2', 'lg-2')
    for (let round = 1; round <= 3; round += 1) {
        await join(io, guestSocket, 'lg-2', roomCode)
        await kick(io, hostSocket, 'lh-2', 'lg-2')
    }
    const other = createFakeSocket('lo-2')
    io.sockets.sockets.set(other.id, other)
    assert.equal((await join(io, other, 'lo-2', roomCode))?.event, 'room_joined')
})

test('방이 없어지면 기록도 없어짐: 방장이 새 방을 만들면 3번 쫓겨난 사람도 들어옴', async () => {
    const { io, hostSocket, guestSocket, roomCode } = await setup('lh-3', 'lg-3')
    for (let round = 1; round <= 3; round += 1) {
        await join(io, guestSocket, 'lg-3', roomCode)
        await kick(io, hostSocket, 'lh-3', 'lg-3')
    }
    assert.equal((await join(io, guestSocket, 'lg-3', roomCode))?.event, 'room_join_failed')

    // 방장이 방을 지워 방이 없어진 뒤 새 방
    matchmaking.__testables.handleDeleteRoom(io, 'lh-3', { socket: hostSocket })
    assert.equal((await current('lh-3')).room, null)
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'lh-3', validSettingsPayload({ maxPlayers: 8, jokerCount: 1 }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))
    assert.equal((await join(io, guestSocket, 'lg-3', created.room.roomCode))?.event, 'room_joined')
})
