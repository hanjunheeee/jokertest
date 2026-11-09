// 조각 4 초대 시험: 초대 만들기가 방 Node 정보·bootEpoch를 RPC로 받음(위험 #18), 받는 사람 상태 RPC, 수락이 방 Node로 이동
// MN-003(서버 쪽)·004·005·111 + RPC 처리기 모양, 메모리 Redis 위 n1(이 프로세스)·n2, DB는 가짜
const test = require('node:test')
const assert = require('node:assert/strict')
const { Op } = require('sequelize')
const h = require('./roomJoinSetup')

const gameInviteService = require('../../../services/friend/gameInvite')
const friendshipRepository = require('../../../repositories/friend/friendship')
const blockRepository = require('../../../repositories/friend/block')
const notificationService = require('../../../services/notification')

const { keys, settle } = h
const NOW = new Date('2026-11-09T12:00:00Z')

// 바꿔 끼우고 시험 끝에 되돌림
const swap = (t, target, name, impl) => {
    const original = target[name]
    target[name] = impl
    t.after(() => { target[name] = original })
}

// 초대 행만 쌓는 가짜 db (만들기 길에 필요한 것만)
function fakeDb() {
    const created = []
    const db = {
        created,
        Sequelize: { Op },
        sequelize: { literal: (text) => ({ literal: text }), transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }) },
        User: { findOne: async ({ where }) => ({ uuid: where.uuid, nickname: `닉-${where.uuid}` }) },
        GameInvite: {
            findOne: async () => null,
            create: async (row) => { created.push(row); return { ...row } },
        },
    }
    return db
}

// 초대 서비스 가짜 주입 (친구·차단·계정·알림)
function fakeInviteDeps(t) {
    const db = fakeDb()
    gameInviteService.__internal.__setDepsForTests({ db, now: () => new Date(NOW), newId: () => 'inv-new', emitToUser: () => {} })
    t.after(() => gameInviteService.__internal.__setDepsForTests(null))
    swap(t, friendshipRepository, 'lockAccountsInOrder', async (uuids) => uuids.map((uuid) => ({ uuid, status: 'ACTIVE' })))
    swap(t, friendshipRepository, 'findExistingFriendship', async () => ({ status: 'ACCEPTED' }))
    swap(t, blockRepository, 'findBlocksBetween', async () => [])
    swap(t, notificationService, 'createForGameInvite', async () => ({ created: true, notification: { id: 'n1' } }))
    swap(t, notificationService, 'emitNotificationCreated', () => {})
    return db
}

// n2에 보내는 사람 방이 있는 것처럼: loc·room 키 + n2 RPC 처리기
async function seedSenderOnN2(n2, { availability = { available: true, code: null } } = {}) {
    const room = { roomId: 'room-n2', roomInstanceId: 'inst-n2', hostUuid: 'host', occupancy: 1, maxPlayers: 8, isFull: false }
    await n2.directory.write(keys().loc('host'), { node: 'n2', bootEpoch: n2.bootEpoch, kind: 'room', id: 'room-n2' }, { ttlMs: 60000 })
    await n2.directory.write(keys().room('room-n2'), { node: 'n2', bootEpoch: n2.bootEpoch, code: 'INVTAB', instanceId: 'inst-n2' }, { ttlMs: 60000 })
    n2.rpc.register('user.roomIdOf', ({ uuid }) => ({ roomId: uuid === 'host' ? 'room-n2' : null }))
    n2.rpc.register('room.describeForInvite', ({ roomId }) => (roomId === 'room-n2' ? { found: true, room: { ...room, bootEpoch: n2.bootEpoch } } : { found: false }))
    n2.rpc.register('user.availability', () => availability)
    return room
}

test('MN-004: 초대 HTTP가 방 없는 n1으로 와도 방 정보·boot_epoch는 방 Node(n2) 것 (위험 #18)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const db = fakeInviteDeps(t)
    await seedSenderOnN2(n2)

    const result = await gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k-4' })

    assert.equal(result.created, true)
    assert.equal(db.created.length, 1)
    assert.equal(db.created[0].room_id, 'room-n2')
    assert.equal(db.created[0].room_instance_id, 'inst-n2')
    assert.notEqual(n2.bootEpoch, h.BOOT)
    assert.equal(db.created[0].boot_epoch, n2.bootEpoch)
})

test('MN-004: 받는 사람이 n2 방에 있으면 n2에 물어 409 RECEIVER_IN_ROOM', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    fakeInviteDeps(t)
    await seedSenderOnN2(n2, { availability: { available: false, code: 'RECEIVER_IN_ROOM' } })
    await n2.directory.write(keys().loc('guest'), { node: 'n2', bootEpoch: n2.bootEpoch, kind: 'room', id: 'room-x' }, { ttlMs: 60000 })

    await assert.rejects(
        gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k-busy' }),
        (err) => err.status === 409 && err.code === 'RECEIVER_IN_ROOM',
    )
})

test('방 Node가 답을 안 하면(RPC 시간 초과) 초대 503 CLUSTER_UNAVAILABLE, 행 안 만듦', async (t) => {
    const { n2 } = await h.startRoomNodes(t, { env: { CLUSTER_RPC_TIMEOUT_MS: '80' } })
    const db = fakeInviteDeps(t)
    await seedSenderOnN2(n2)
    n2.rpc.register('room.describeForInvite', () => new Promise(() => {}))

    await assert.rejects(
        gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k-slow' }),
        (err) => err.status === 503 && err.code === 'CLUSTER_UNAVAILABLE',
    )
    assert.equal(db.created.length, 0)
})

test('RPC 처리기: n2가 n1 방을 물으면 방 정보 + n1 bootEpoch, 사람 방 id·상태도 답함', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const { answer } = await h.createRoom('host-n1', 'code')
    const { roomId, roomInstanceId } = answer.room

    const described = await n2.rpc.call('n1', 'room.describeForInvite', { roomId })
    assert.equal(described.found, true)
    assert.equal(described.room.roomId, roomId)
    assert.equal(described.room.roomInstanceId, roomInstanceId)
    assert.equal(described.room.bootEpoch, h.BOOT)
    assert.deepEqual(await n2.rpc.call('n1', 'room.describeForInvite', { roomId: 'nope' }), { found: false })
    assert.deepEqual(await n2.rpc.call('n1', 'user.roomIdOf', { uuid: 'host-n1' }), { roomId })
    assert.deepEqual(await n2.rpc.call('n1', 'user.availability', { uuid: 'host-n1' }), { available: false, code: 'RECEIVER_IN_ROOM' })
    assert.deepEqual(await n2.rpc.call('n1', 'user.availability', { uuid: 'free' }), { available: true, code: null })
})

// 수락 길 가짜 초대 서비스 (방·부팅 값만 다르게)
function acceptService({ roomId, roomInstanceId, bootEpoch }) {
    const calls = { decision: 0 }
    return {
        calls,
        async getAttemptOutcome() { return { known: true, roomId, roomInstanceId, bootEpoch, invite: {} } },
        async recordAcceptDecision() { calls.decision += 1; return { ok: true } },
        async finalizeAcceptedEntry({ publish }) { const r = publish(); return r.ok ? { ok: true } : { ok: false, code: r.code } },
        async recordEntryInterrupted() { return true },
        async cancelPendingInvitesForRoom() { return [] },
    }
}

const accept = (io, socket, uuid) => new Promise((resolve) => h.matchmaking.__testables.handleAcceptGameInvite(io, socket, uuid, { inviteId: 'inv-1' }, resolve))

test('MN-003: n2 방 초대를 n1에서 수락 → ack ROOM_ON_OTHER_NODE + node n2, 수락 기록(DB) 안 함', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await h.seedRemoteRoom(n2, { roomId: 'room-inv', code: 'INVAAB', instanceId: 'inst-inv' })
    const service = acceptService({ roomId: 'room-inv', roomInstanceId: 'inst-inv', bootEpoch: n2.bootEpoch })
    h.matchmaking.__setGameInviteServiceForTests(service)
    const guest = h.createFakeSocket('guest-3')

    const answer = await accept(h.createFakeIo([guest]), guest, 'guest-3')

    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(answer.node, 'n2')
    assert.equal(service.calls.decision, 0)
})

test('MN-005: 방 Node(n1)에서 수락할 때 boot_epoch가 맞아 SERVER_RESTARTED 안 남 (n2가 RPC로 받은 값으로 만든 초대)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const { io, answer } = await h.createRoom('host-5', 'code')
    // n2가 초대 만들 때 받는 값 = n1 BOOT_EPOCH
    const described = await n2.rpc.call('n1', 'room.describeForInvite', { roomId: answer.room.roomId })
    const service = acceptService({ roomId: answer.room.roomId, roomInstanceId: answer.room.roomInstanceId, bootEpoch: described.room.bootEpoch })
    h.matchmaking.__setGameInviteServiceForTests(service)
    const guest = h.createFakeSocket('guest-5')
    io.sockets.sockets.set(guest.id, guest)

    const result = await accept(io, guest, 'guest-5')

    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(result.room.roomId, answer.room.roomId)
    assert.equal(service.calls.decision, 1)
})

test('MN-111: 죽은 Node 방 초대 수락 → NODE_UNAVAILABLE (흔적 지움)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await h.seedRemoteRoom(n2, { roomId: 'room-dead', code: 'DINVAB', node: 'n3', bootEpoch: 'boot-n3', instanceId: 'inst-dead' })
    const service = acceptService({ roomId: 'room-dead', roomInstanceId: 'inst-dead', bootEpoch: 'boot-n3' })
    h.matchmaking.__setGameInviteServiceForTests(service)
    const guest = h.createFakeSocket('guest-d')

    const answer = await accept(h.createFakeIo([guest]), guest, 'guest-d')

    assert.equal(answer.code, 'NODE_UNAVAILABLE')
    assert.equal(service.calls.decision, 0)
    await settle()
    assert.equal((await n2.directory.read(keys().room('room-dead'))).value, null)
})

test('Redis 죽음 + 다른 부팅 초대 → CLUSTER_UNAVAILABLE, 단일 모드면 예전처럼 SERVER_RESTARTED', async (t) => {
    const { hub } = await h.startRoomNodes(t)
    const service = acceptService({ roomId: 'room-x', roomInstanceId: 'inst-x', bootEpoch: 'other-boot' })
    h.matchmaking.__setGameInviteServiceForTests(service)
    const guest = h.createFakeSocket('guest-x')
    hub.setDown(true)
    assert.equal((await accept(h.createFakeIo([guest]), guest, 'guest-x')).code, 'CLUSTER_UNAVAILABLE')
    await h.cluster.close()
    assert.equal((await accept(h.createFakeIo([guest]), guest, 'guest-x')).code, 'SERVER_RESTARTED')
})
