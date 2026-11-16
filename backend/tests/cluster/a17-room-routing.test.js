'use strict'

// 서버 여러 대 — 방 입장 길잡이 시험: 다른 Node 방 코드·공개 방·초대 수락이 그 Node로 옮기라는 답을 받고, 옮긴 뒤 다시 보낸 입장이 그 방 규칙대로 (n1·n2 둘 다 진짜 코드, 메모리 Redis)
// 목록 A17-B-013~025, 돌리기: cd backend && node --env-file=.env.test --test --test-timeout=60000 --test-force-exit tests/cluster/a17-room-routing.test.js
const test = require('node:test')
const assert = require('node:assert/strict')

const W = require('./a17-world')

// 초대 방 접근자(초대 만들기가 방 정보를 읽는 길)를 보려고 초대 서비스도 Node마다 따로 불러 둠
const EXTRA = ['services/friend/gameInvite']
const B = { n1: W.loadBundle({ extra: EXTRA }), n2: W.loadBundle({ extra: EXTRA }) }

const MSG = {
    ROOM_ON_OTHER_NODE: '방이 있는 서버로 옮겨 다시 시도합니다.',
    NODE_UNAVAILABLE: '방을 찾을 수 없습니다. 잠시 후 다시 시도해주세요.',
    CLUSTER_UNAVAILABLE: '지금은 방 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.',
}

// 이 Node에 방 하나 (방장 접속 포함) → 만들기 답
async function roomOn(w, node, uuid, overrides = {}) {
    node.connect(uuid)
    const created = await node.createRoom(uuid, overrides)
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code}`)
    await w.settle()
    return created
}

// 지금 방 (get_current_room 답의 room, 없으면 null)
const currentRoom = (node, uuid) => new Promise((resolve) => node.b.MM.handleGetCurrentRoom(uuid, (r) => resolve(r?.room ?? null)))

// 다른 Node에서 코드 입장 → 옮기라는 답 확인 → 그 Node로 옮겨 다시 보냄 → 다시 보낸 답
async function moveAndJoin(from, to, uuid, code) {
    from.connect(uuid)
    const first = await from.joinByCode(uuid, code)
    assert.equal(first?.payload?.code, 'ROOM_ON_OTHER_NODE', `옮기라는 답이 아님: ${JSON.stringify(first)}`)
    assert.equal(first.payload.node, to.id)
    from.drop(uuid)
    to.connect(uuid)
    return to.joinByCode(uuid, code)
}

// 초대 기록 가짜 저장소 (모든 Node가 같이 씀 = DB 하나), 초대 서비스 중 수락에 쓰는 것만
function createInviteStore() {
    const rows = new Map()
    return {
        rows,
        add(row) { rows.set(row.id, { status: 'PENDING', attempt_id: null, ...row }) },
        cancelPendingInvitesForRoom: async () => {},
        getAttemptOutcome: async ({ receiverId, inviteId }) => {
            const row = rows.get(inviteId)
            if (!row || row.receiver_id !== receiverId) return { known: false }
            return { known: true, staleAttempt: false, roomId: row.room_id, roomInstanceId: row.room_instance_id, bootEpoch: row.boot_epoch, entryOutcome: null }
        },
        recordAcceptDecision: async ({ inviteId, attemptId }) => {
            const row = rows.get(inviteId)
            row.status = 'ACCEPTED'
            row.attempt_id = attemptId
            return { ok: true }
        },
        finalizeAcceptedEntry: async ({ publish }) => {
            const committed = publish()
            return committed?.ok === true ? { ok: true } : { ok: false, code: committed?.code ?? 'ROOM_STATE_CHANGED', published: false }
        },
        recordEntryInterrupted: async () => false,
    }
}

// 두 Node 모두 초대 서비스를 같은 가짜 저장소로
function useInviteStore(w) {
    const store = createInviteStore()
    for (const node of [w.n1, w.n2]) node.b.mf.installFakeMatchmakingDeps(node.b.mm, { gameInviteService: store })
    return store
}

const accept = (node, uuid, inviteId) => node.ask(node.b.MM.handleAcceptGameInvite, uuid, { inviteId })

test('A17-B-013 n2 방 코드를 n1 사람이 입장 → ROOM_ON_OTHER_NODE(node n2) 답, 명단 변화 없음', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const created = await roomOn(w, w.n2, 'b013-host')
    w.n1.connect('b013-j')
    const r = await w.n1.joinByCode('b013-j', created.room.roomCode)
    assert.equal(r?.event, 'room_join_failed')
    assert.deepEqual(r.payload, { code: 'ROOM_ON_OTHER_NODE', node: 'n2', message: MSG.ROOM_ON_OTHER_NODE })
    assert.equal(await currentRoom(w.n1, 'b013-j'), null, 'n1에 방 자리가 생김')
    assert.deepEqual((await currentRoom(w.n2, 'b013-host')).players.map((p) => p.uuid), ['b013-host'])
    assert.equal(w.n2.received('b013-host', 'player_joined_room').length, 0)
})

test('A17-B-014 n2 공개 방을 n1에서 목록으로 골라 입장 → ROOM_ON_OTHER_NODE(node n2)', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const created = await roomOn(w, w.n2, 'b014-host', { accessType: 'open' })
    w.n1.connect('b014-j')
    const r = await w.n1.joinPublic('b014-j', created.room.roomId)
    assert.equal(r?.event, 'room_join_failed')
    assert.equal(r.payload.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(r.payload.node, 'n2')
})

// 아무도 안 쓴 코드 (헷갈리는 글자 뺀 6자리)
const UNUSED_CODE = 'ZZZZ22'
for (const [num, at, other] of [['015', 'n1', 'n2'], ['016', 'n2', 'n1']]) {
    test(`A17-B-${num} 아무도 안 쓴 코드를 ${at}에서 입장 → ROOM_CODE_MISMATCH, 다른 Node 답과 같음`, { timeout: 30000 }, async (t) => {
        const w = await W.startNodes(t, B)
        w[at].connect(`b${num}-j`)
        w[other].connect(`b${num}-k`)
        const mine = await w[at].joinByCode(`b${num}-j`, UNUSED_CODE)
        const theirs = await w[other].joinByCode(`b${num}-k`, UNUSED_CODE)
        assert.equal(mine?.event, 'room_join_failed')
        assert.deepEqual(mine.payload, theirs?.payload)
        assert.equal(mine.payload.code, 'ROOM_CODE_MISMATCH')
    })
}

test('A17-B-017 죽은 n2의 방 코드를 n1에서 치면 "방 없음" + room·roomcode 키 지움', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const created = await roomOn(w, w.n2, 'b017-host')
    const k = w.n1.dirKeys()
    const roomKey = k.room(created.room.roomId)
    const codeKey = k.roomcode(created.room.roomCode)
    assert.ok(await w.n1.readKey(roomKey), '준비: room 키 있음')
    await w.kill('n2')
    w.n1.connect('b017-j')
    const r = await w.n1.joinByCode('b017-j', created.room.roomCode)
    assert.equal(r?.event, 'room_join_failed')
    assert.equal(await w.n1.readKey(roomKey), null, 'room 키가 남음')
    assert.equal(await w.n1.readKey(codeKey), null, 'roomcode 키가 남음')
    // "방 없음" = 아무도 안 쓴 코드를 같은 Node에서 쳤을 때와 같은 답 (코드 이름은 B-015~016이 봄)
    w.n1.connect('b017-k')
    const none = await w.n1.joinByCode('b017-k', UNUSED_CODE)
    assert.deepEqual(r.payload, none?.payload)
})

test('A17-B-018 목록에서 고른 n2 공개 방, 고른 직후 n2 죽음 → NODE_UNAVAILABLE "방을 찾을 수 없습니다…"', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const created = await roomOn(w, w.n2, 'b018-host', { accessType: 'open' })
    await w.kill('n2')
    w.n1.connect('b018-j')
    const r = await w.n1.joinPublic('b018-j', created.room.roomId)
    assert.equal(r?.event, 'room_join_failed')
    assert.equal(r.payload.code, 'NODE_UNAVAILABLE')
    assert.equal(r.payload.message, MSG.NODE_UNAVAILABLE)
})

test('A17-B-019 Redis 죽은 동안 n2 방 코드를 n1에서 입장 → CLUSTER_UNAVAILABLE "지금은 방 위치를…"', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const created = await roomOn(w, w.n2, 'b019-host')
    w.hub.setDown(true)
    w.n1.connect('b019-j')
    const r = await w.n1.joinByCode('b019-j', created.room.roomCode)
    assert.equal(r?.event, 'room_join_failed')
    assert.equal(r.payload.code, 'CLUSTER_UNAVAILABLE')
    assert.equal(r.payload.message, MSG.CLUSTER_UNAVAILABLE)
})

test('A17-B-020 Redis 죽은 동안 n1 방 코드를 n1 사람이 입장 → 입장됨, 준비 안 됨', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const created = await roomOn(w, w.n1, 'b020-host')
    w.hub.setDown(true)
    w.n1.connect('b020-j')
    const r = await w.n1.joinByCode('b020-j', created.room.roomCode)
    assert.equal(r?.event, 'room_joined', `입장 실패: ${JSON.stringify(r?.payload)}`)
    const me = r.payload.players?.find((p) => p.uuid === 'b020-j') ?? r.payload.room?.players?.find((p) => p.uuid === 'b020-j')
    assert.ok(me, '명단에 없음')
    assert.equal(me.isReady, false)
})

// 초대 행 하나 (n2 방, n2 부팅 값) → 초대 id
function inviteFor(store, created, receiverId, id) {
    store.add({
        id, sender_id: created.room.hostUuid, receiver_id: receiverId,
        room_id: created.room.roomId, room_instance_id: created.room.roomInstanceId, boot_epoch: created.room.bootEpoch,
    })
    return id
}

test('A17-B-021 n2 방 초대를 n1에 붙은 사람이 수락 → { ok:false, ROOM_ON_OTHER_NODE, node n2 }, 초대는 아직 수락 안 됨', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const store = useInviteStore(w)
    const created = await roomOn(w, w.n2, 'b021-host')
    const inviteId = inviteFor(store, created, 'b021-r', 'inv-021')
    w.n1.connect('b021-r')
    const r = await accept(w.n1, 'b021-r', inviteId)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(r.node, 'n2')
    assert.equal(store.rows.get(inviteId).status, 'PENDING', '초대가 수락으로 바뀜')
})

test('A17-B-022 초대한 방의 n2가 죽음 → n1에서 수락하면 NODE_UNAVAILABLE', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const store = useInviteStore(w)
    const created = await roomOn(w, w.n2, 'b022-host')
    const inviteId = inviteFor(store, created, 'b022-r', 'inv-022')
    await w.kill('n2')
    w.n1.connect('b022-r')
    const r = await accept(w.n1, 'b022-r', inviteId)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'NODE_UNAVAILABLE')
})

test('A17-B-023 n2 방 방장의 초대를 n1이 받아도 방 정보는 n2 방 것, 받는 사람이 n2에서 수락하면 SERVER_RESTARTED 아님', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const store = useInviteStore(w)
    const created = await roomOn(w, w.n2, 'b023-host', { maxPlayers: 7 })
    // 초대 만들기가 보낸 사람 방을 읽는 길 그대로 (n1 Node의 초대 방 접근자 → n2에 물음)
    const access = w.n1.b.x['services/friend/gameInvite'].__internal.__getRoomAccess()
    const roomId = await access.getRoomIdForUser('b023-host')
    assert.equal(roomId, created.room.roomId)
    const info = await access.describeRoomForInvite(roomId)
    assert.ok(info, '방 정보를 못 읽음')
    assert.equal(info.roomInstanceId, created.room.roomInstanceId)
    assert.equal(info.maxPlayers, 7)
    assert.equal(info.bootEpoch, w.n2.b.mm.__getBootEpochForTests())
    assert.notEqual(info.bootEpoch, w.n1.b.mm.__getBootEpochForTests())
    // 초대 만들기가 쓰는 값으로 초대 행 (부팅 값 = 읽은 방 정보 것)
    store.add({ id: 'inv-023', sender_id: 'b023-host', receiver_id: 'b023-r', room_id: info.roomId, room_instance_id: info.roomInstanceId, boot_epoch: info.bootEpoch })
    w.n2.connect('b023-r')
    const r = await accept(w.n2, 'b023-r', 'inv-023')
    assert.notEqual(r.code, 'SERVER_RESTARTED')
    assert.equal(r.ok, true, `수락 실패: ${r.code} ${r.message}`)
})

test('A17-B-024 n1 방(정원 5) 5명 참 → n2 사람 코드 입장 → n1로 옮겨 다시 보냄 → ROOM_FULL', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const created = await roomOn(w, w.n1, 'b024-0', { maxPlayers: 5 })
    for (let i = 1; i < 5; i += 1) {
        w.n1.connect(`b024-${i}`)
        const r = await w.n1.joinByCode(`b024-${i}`, created.room.roomCode)
        assert.equal(r?.event, 'room_joined', `준비: ${i}번 입장 실패`)
    }
    const again = await moveAndJoin(w.n2, w.n1, 'b024-x', created.room.roomCode)
    assert.equal(again?.event, 'room_join_failed')
    assert.equal(again.payload.code, 'ROOM_FULL')
})

test('A17-B-025 n1 방에서 3번 추방된 사람이 n2 로비에서 코드 입장 → n1로 옮겨도 못 들어옴', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    const created = await roomOn(w, w.n1, 'b025-host', { maxPlayers: 5 })
    const code = created.room.roomCode
    const kicked = 'b025-k'
    w.n1.connect(kicked)
    let seq = 0
    for (let n = 1; n <= 3; n += 1) {
        const joined = await w.n1.joinByCode(kicked, code)
        assert.equal(joined?.event, 'room_joined', `준비: ${n}번째 입장 실패 ${JSON.stringify(joined?.payload)}`)
        const room = await currentRoom(w.n1, 'b025-host')
        seq += 1
        const r = await w.n1.ask(w.n1.b.MM.handleKickRoomPlayer, 'b025-host', {
            requestId: `kick-${seq}`, bootEpoch: room.bootEpoch, roomId: room.roomId, roomInstanceId: room.roomInstanceId,
            requesterMembershipId: room.players.find((p) => p.uuid === 'b025-host')?.membershipId ?? 'none',
            targetUuid: kicked, targetMembershipId: room.players.find((p) => p.uuid === kicked)?.membershipId ?? 'none',
        })
        assert.equal(r.ok, true, `준비: ${n}번째 추방 실패 ${r.code}`)
        await w.settle()
    }
    // 로비로 가서 n2에 붙음
    w.n1.drop(kicked)
    const again = await moveAndJoin(w.n2, w.n1, kicked, code)
    assert.equal(again?.event, 'room_join_failed')
    assert.equal(again.payload.code, 'KICKED_TOO_MANY_TIMES')
})
