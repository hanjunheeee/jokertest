// 조각 4 방 입장 시험: 다른 Node 방 코드·공개 방 입장 이동 답, 방·코드 디렉터리, 코드 겹침, 시도 제한, Redis 죽음·Node 죽음
// MN-001·002(서버 쪽)·013·014·015·016·018·019·023·025·095·096·110, 메모리 Redis 위 n1(이 프로세스)·n2
const test = require('node:test')
const assert = require('node:assert/strict')
const h = require('./roomJoinSetup')

const { keys, settle, cluster } = h

test('MN-001: n2 방 코드를 n1에서 치면 room_join_failed ROOM_ON_OTHER_NODE + node n2 (DB·명단 안 건드림)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await h.seedRemoteRoom(n2, { roomId: 'room-a', code: 'CODEAB' })
    const joiner = h.createFakeSocket('u-join')
    const io = h.createFakeIo([joiner])

    await h.handleJoinRoomByCode(io, joiner, 'u-join', 'CODEAB')

    const failure = h.lastJoinFailure(joiner)
    assert.equal(failure.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(failure.node, 'n2')
    assert.equal(typeof failure.message, 'string')
    assert.deepEqual(joiner.joined, [])
    assert.equal(require('../../../socket/matchmaking/core/state').playerRoom.has('u-join'), false)
})

test('MN-002: 공개 목록에서 고른 n2 방(roomId) → ROOM_ON_OTHER_NODE + node, n2가 draining이어도 그대로 (MN-025)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await h.seedRemoteRoom(n2, { roomId: 'room-open', code: 'OPENAB' })
    n2.nodes.setDraining(true)
    await cluster.nodes.refresh()
    const joiner = h.createFakeSocket('u-pick')

    await h.handleJoinPublicRoom(h.createFakeIo([joiner]), joiner, 'u-pick', { roomId: 'room-open' })

    assert.deepEqual(
        (({ code, node }) => ({ code, node }))(h.lastJoinFailure(joiner)),
        { code: 'ROOM_ON_OTHER_NODE', node: 'n2' },
    )
})

test('MN-016: n1에서 만든 방은 room·roomcode 키가 생기고, 방을 지우면 둘 다 지워짐', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const { io, host, answer } = await h.createRoom('host-1', 'code')
    assert.equal(answer.ok, true)
    const { roomId, roomCode, roomInstanceId } = answer.room
    await settle()

    assert.deepEqual((await n2.directory.read(keys().room(roomId))).value, {
        node: 'n1', bootEpoch: h.BOOT, code: roomCode, instanceId: roomInstanceId,
    })
    assert.equal((await n2.directory.read(keys().roomcode(roomCode))).value, roomId)

    await new Promise((resolve) => h.handleDeleteRoom(io, 'host-1', { socket: host, callback: resolve }))
    await settle()
    assert.equal((await n2.directory.read(keys().room(roomId))).value, null)
    assert.equal((await n2.directory.read(keys().roomcode(roomCode))).value, null)
})

test('MN-014: 없는 코드 → n1·n2 어디든 같은 "코드 틀림" (단일 모드 답과 같음)', async (t) => {
    await h.startRoomNodes(t)
    const joiner = h.createFakeSocket('u-none')
    await h.handleJoinRoomByCode(h.createFakeIo([joiner]), joiner, 'u-none', 'ZZZZZZ')
    assert.equal(h.lastJoinFailure(joiner).code, 'ROOM_CODE_MISMATCH')
    assert.equal(h.lastJoinFailure(joiner).message, '입장 코드와 일치하는 방이 없습니다.')
})

test('MN-015: n2에서 시작된 방 코드 → n1에서도 "이미 시작", 판이 끝나 빠지면 "이미 끝남"', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await n2.directory.write(keys().startedcode('STARTD'), { gameId: 'g-n2', node: 'n2' }, { ttlMs: 60000 })
    await n2.directory.write(keys().game('g-n2'), 'n2', { ttlMs: 60000 })
    const joiner = h.createFakeSocket('u-late')
    const io = h.createFakeIo([joiner])

    await h.handleJoinRoomByCode(io, joiner, 'u-late', 'STARTD')
    assert.equal(h.lastJoinFailure(joiner).code, 'ROOM_ALREADY_STARTED')

    await n2.directory.removeIfOwned(keys().game('g-n2'))
    await h.handleJoinRoomByCode(io, joiner, 'u-late', 'STARTD')
    assert.equal(h.lastJoinFailure(joiner).code, 'SESSION_ENDED')
})

test('MN-015: 이 Node에서 시작한 방은 startedcode {gameId, node}를 씀 (다른 Node가 읽음)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const { rememberStartedRoom } = require('../../../socket/matchmaking/join/startedMarks')
    rememberStartedRoom({ id: 'room-s', code: 'MINEAB' }, 'g-mine')
    await settle()
    assert.deepEqual((await n2.directory.read(keys().startedcode('MINEAB'))).value, { gameId: 'g-mine', node: 'n1' })
})

test('MN-013: 옮긴 뒤 다시 보낸 요청이 방 Node에서 꽉 참이면 ROOM_FULL 그대로 (다른 Node 안 봄)', async (t) => {
    await h.startRoomNodes(t)
    const players = new Map(Array.from({ length: 8 }, (_, i) => [`p${i}`, { uuid: `p${i}`, nickname: `p${i}`, isReady: false }]))
    h.matchmaking.__seedRoomForTests({
        id: 'room-full', instanceId: 'inst-full', code: 'FULLAB', hostUuid: 'p0', accessType: 'code',
        players, settings: { ...h.validSettingsPayload(), maxPlayers: 8 },
    })
    const joiner = h.createFakeSocket('u-full')
    await h.handleJoinRoomByCode(h.createFakeIo([joiner]), joiner, 'u-full', 'FULLAB')
    assert.equal(h.lastJoinFailure(joiner).code, 'ROOM_FULL')
})

test('MN-018: 두 Node가 같은 코드를 동시에 뽑으면 하나만 잡고, 진 쪽은 다음 코드로', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const codes = ['SAMEAB', 'NEXTAB']
    let i = 0
    const generator = () => codes[Math.min(i++, codes.length - 1)]
    // n2가 먼저 잡음 → n1은 다음 코드
    const [n2Won, n1Result] = await Promise.all([
        n2.directory.write(keys().roomcode('SAMEAB'), 'room-of-n2', { ttlMs: 60000, nx: true }),
        h.tick(0).then(() => h.roomDirectory.reserveRoomCode('room-of-n1', { generator })),
    ])
    assert.equal(n2Won, true)
    assert.deepEqual(n1Result, { code: 'NEXTAB', claimed: true })
    assert.equal((await n2.directory.read(keys().roomcode('SAMEAB'))).value, 'room-of-n2')
    // 정말 동시: 같은 코드 NX 둘 → 하나만 claimed
    const both = await Promise.all([
        h.roomDirectory.claimRoomCode('RACEAB', 'r1'),
        n2.directory.write(keys().roomcode('RACEAB'), 'r2', { ttlMs: 60000, nx: true }),
    ])
    assert.equal([both[0] === 'claimed', both[1] === true].filter(Boolean).length, 1)
})

test('MN-019: 코드 입장 시도 제한을 Node끼리 합쳐 셈 (n2에서 19번 + n1에서 2번 → 21번째 거절)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    for (let k = 0; k < 19; k += 1) await n2.counters.hit('join:u-guess', 60000)
    const joiner = h.createFakeSocket('u-guess')
    const io = h.createFakeIo([joiner])
    await h.handleJoinRoomByCode(io, joiner, 'u-guess', 'AAAAAA')
    assert.equal(h.lastJoinFailure(joiner).code, 'ROOM_CODE_MISMATCH')
    await h.handleJoinRoomByCode(io, joiner, 'u-guess', 'AAAAAB')
    assert.equal(h.lastJoinFailure(joiner).code, 'TOO_MANY_JOIN_ATTEMPTS')
})

test('MN-110: 죽은 Node 방 코드를 치면 "방 없음"(코드 틀림)이고 room·roomcode 흔적을 지움', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await h.seedRemoteRoom(n2, { roomId: 'room-dead', code: 'DEADAB', node: 'n3', bootEpoch: 'gone' })
    const joiner = h.createFakeSocket('u-dead')
    await h.handleJoinRoomByCode(h.createFakeIo([joiner]), joiner, 'u-dead', 'DEADAB')
    assert.equal(h.lastJoinFailure(joiner).code, 'ROOM_CODE_MISMATCH')
    assert.equal((await n2.directory.read(keys().room('room-dead'))).value, null)
    assert.equal((await n2.directory.read(keys().roomcode('DEADAB'))).value, null)
})

test('MN-023: 목록에서 고른 방의 Node가 죽었으면 NODE_UNAVAILABLE (node 칸 없음), 로비 그대로', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await h.seedRemoteRoom(n2, { roomId: 'room-gone', code: 'GONEAB', node: 'n3', bootEpoch: 'gone' })
    const joiner = h.createFakeSocket('u-gone')
    await h.handleJoinPublicRoom(h.createFakeIo([joiner]), joiner, 'u-gone', { roomId: 'room-gone' })
    const failure = h.lastJoinFailure(joiner)
    assert.equal(failure.code, 'NODE_UNAVAILABLE')
    assert.equal('node' in failure, false)
    assert.deepEqual(joiner.joined, [])
})

test('MN-095·096: Redis 죽은 동안 방 만들기는 됨(내 Node 코드 검사만), 다른 Node 코드 입장은 CLUSTER_UNAVAILABLE', async (t) => {
    const { hub } = await h.startRoomNodes(t)
    hub.setDown(true)
    const { answer } = await h.createRoom('host-down', 'code')
    assert.equal(answer.ok, true)
    assert.match(answer.room.roomCode, /^[A-Z2-9]{6}$/)

    const joiner = h.createFakeSocket('u-down')
    await h.handleJoinRoomByCode(h.createFakeIo([joiner]), joiner, 'u-down', 'ELSEAB')
    assert.equal(h.lastJoinFailure(joiner).code, 'CLUSTER_UNAVAILABLE')
    // 내 Node 방 코드는 그대로 들어감
    const local = h.createFakeSocket('u-local')
    await h.handleJoinRoomByCode(h.createFakeIo([local]), local, 'u-local', answer.room.roomCode)
    assert.equal(local.emitted.some((e) => e.event === 'room_joined'), true)
})

test('node 칸 모양: 따라갈 수 없는 Node 이름이면 node 빼고 NODE_UNAVAILABLE', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const { nodeFailure } = require('../../../socket/matchmaking/cluster/roomRouting')
    assert.deepEqual(Object.keys(nodeFailure('ROOM_ON_OTHER_NODE', 'bad node!')).sort(), ['code', 'message'])
    assert.equal(nodeFailure('ROOM_ON_OTHER_NODE', 'n2').node, 'n2')
    assert.ok(n2)
})

test('MN-099(방 쪽): Redis가 비었다 살아나면 이 Node 방 room·roomcode 키를 다시 씀', async (t) => {
    const { n2, hub } = await h.startRoomNodes(t)
    const { answer } = await h.createRoom('host-resync', 'code')
    await settle()
    hub.setDown(true)
    hub.flush()
    hub.setDown(false)
    await h.waitFor(async () => (await n2.directory.read(keys().room(answer.room.roomId))).value !== null, 3000)
    assert.equal((await n2.directory.read(keys().roomcode(answer.room.roomCode))).value, answer.room.roomId)
})
