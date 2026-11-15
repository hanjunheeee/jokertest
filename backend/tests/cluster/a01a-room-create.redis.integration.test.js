'use strict'

// 서버 두 대 방 만들기 시험 (진짜 시험 Redis + Node A·B 둘 다 진짜 코드) — 코드 안 겹침·다른 서버 방 목록·탈주 막힘 나눔·시작하면 목록에서 빠짐·비우는 서버
// 목록 A01-B-196~200 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "Redis 붙는 것"), REDIS_URL_TEST 없으면 건너뜀
// 돌리기: AGENT_NAME=<이름> REDIS_URL_TEST=redis://127.0.0.1:6380 bash ../tools/시험도구/with-lock.sh redis node --env-file=.env.test --test --test-concurrency=1 --test-timeout=60000 tests/cluster/a01a-room-create.redis.integration.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const crypto = require('node:crypto')

const RN = require('./helpers/redisNodes')

const BACKEND = path.resolve(__dirname, '../..')
const SEP = path.sep
const isBackendFile = (file) => file.startsWith(BACKEND + SEP) && !file.includes(`${SEP}node_modules${SEP}`)

// backend 코드를 처음부터 다시 불러 따로 된 묶음 만들기 (장부·cluster가 묶음마다 따로 → 한 프로세스에 Node 둘)
// 불러온 뒤 원래 불러 둔 것은 되돌림 (이 파일 안에서만 씀, 공용으로 올릴 것: a17-world.js loadFresh와 같은 생각)
function loadBundle() {
    const saved = new Map()
    for (const key of Object.keys(require.cache)) {
        if (!isBackendFile(key)) continue
        saved.set(key, require.cache[key])
        delete require.cache[key]
    }
    try {
        const r = (rel) => require(path.join(BACKEND, rel))
        const gf = r('tests/audit-2026-11-09/gameFixtures')
        const mm = r('socket/matchmaking')
        const gs = r('socket/gameSession')
        return {
            gf, mm, gs,
            MM: mm.__testables,
            G: gs.__testables,
            mf: r('tests/helpers/matchmakingFixtures'),
            cluster: r('cluster'),
            mem: r('cluster/testing/memoryCluster'),
            desertion: r('services/game/desertion'),
            view: r('socket/matchmaking/room/view'),
            roomListSync: r('socket/matchmaking/cluster/roomListSync'),
            roomDirectory: r('socket/matchmaking/cluster/roomDirectory'),
        }
    } finally {
        for (const key of Object.keys(require.cache)) if (isBackendFile(key)) delete require.cache[key]
        for (const [key, mod] of saved) require.cache[key] = mod
    }
}

// Node 둘 몫 코드 (Redis 없으면 안 불러옴, 무거워서)
const BUNDLES = RN.REDIS_URL_TEST ? { A: loadBundle(), B: loadBundle() } : null
const OPTS = { skip: RN.skipReason, timeout: 30000 }

// 하트비트 100ms (진짜 시계), 죽음 판정 3초
const FAST_ENV = { CLUSTER_HEARTBEAT_MS: '100', NODE_DEAD_AFTER_MS: '3000', PRESENCE_OFFLINE_DELAY_MS: '0' }

// 탈주 기록 가짜 저장소 (두 Node가 같이 씀 = DB 하나)
const FAKE_DESERTION_REPO = {
    findDesertionsForWarmup: async () => [],
    countDesertionsSince: async () => 0,
    insertDesertion: async () => ({ created: true, row: null }),
}

// 묶음 장부 비우기 + 가짜 의존 끼우기 (시험 앞뒤)
function resetBundle(b) {
    b.gf.resetCore()
    b.mm.__resetStateForTests()
    b.gs.__resetStateForTests()
    b.roomListSync.__resetRoomListSyncForTests()
    b.desertion.__resetForTests()
    b.mf.installFakeMatchmakingDeps(b.mm)
    b.G.__setRecordVoteParticipationForTests(async () => {})
    b.G.__setEvaluateAchievementsForTests(async () => {})
    b.G.__setGameResultPersistForTests(async () => ({ ok: true }))
    b.desertion.__setRepositoryForTests(FAKE_DESERTION_REPO)
}

// Node 한 대 손잡이: 사람 소켓·가짜 io·사건 보내기
function makeNode(id, b) {
    const registry = new Map()
    b.mm.setOnlineUsersRegistry(registry)
    b.gs.setOnlineUsersRegistry(registry)
    const io = b.mf.createFakeIo([])
    const sockets = new Map()
    const getCurrentSocketId = (uuid) => registry.get(uuid)
    const node = {
        id, b, io,
        connect(uuid) {
            const s = b.mf.createFakeSocket(uuid, { id: `${id}-sock-${uuid}` })
            io.sockets.sockets.set(s.id, s)
            registry.set(uuid, s.id)
            sockets.set(uuid, s)
            b.mm.registerMatchmakingHandlers(io, s, uuid, { getCurrentSocketId })
            return s
        },
        emit: (uuid, event, payload) => new Promise((resolve) => sockets.get(uuid).trigger(event, payload, resolve)),
        create: (uuid, overrides = {}) => node.emit(uuid, 'create_room', {
            accessType: 'open', maxPlayers: 10, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60, ...overrides,
        }),
        publicRooms: async (uuid) => (await node.emit(uuid, 'get_public_rooms', {})).rooms,
        join: (uuid, code) => b.MM.handleJoinRoomByCode(io, sockets.get(uuid), uuid, code),
    }
    return node
}

// 조건이 될 때까지 진짜 시간으로 기다림 (최대 8초)
async function waitUntil(check, timeoutMs = 8000) {
    const end = Date.now() + timeoutMs
    while (!(await check())) {
        if (Date.now() > end) throw new Error('기다림 시간 초과')
        await new Promise((resolve) => setTimeout(resolve, 25))
    }
}

// Node A·B를 진짜 Redis에 붙임 (키 앞머리는 이 시험만), 서로를 볼 때까지 기다림
async function startPair(t) {
    const prefix = `a01a-${crypto.randomUUID().slice(0, 8)}`
    const suffix = prefix.slice(-4)
    const ids = { A: `a01aA${suffix}`, B: `a01aB${suffix}` }
    for (const b of Object.values(BUNDLES)) resetBundle(b)
    t.after(async () => {
        for (const b of Object.values(BUNDLES)) {
            b.cluster.nodes.setDraining(false)
            await b.cluster.close().catch(() => {})
            resetBundle(b)
            b.desertion.__setRepositoryForTests(null)
        }
        await RN.cleanupPrefix(prefix)
    })
    const nodes = {}
    for (const key of ['A', 'B']) {
        const b = BUNDLES[key]
        await b.cluster.init({
            env: { ...FAST_ENV, SERVER_ID: ids[key], REDIS_URL: RN.REDIS_URL_TEST, REDIS_KEY_PREFIX: prefix },
            bootEpoch: b.mm.__getBootEpochForTests(),
            log: b.mem.quietLog,
        })
        assert.equal(b.cluster.state(), 'up', `Node ${key}가 Redis에 못 붙음`)
        nodes[key] = makeNode(ids[key], b)
    }
    // 서로를 살아 있는 Node로 볼 때까지
    await waitUntil(async () => {
        for (const b of Object.values(BUNDLES)) await b.cluster.nodes.refresh().catch(() => {})
        return Object.values(BUNDLES).every((b) => {
            const alive = b.cluster.nodes.list().filter((n) => n.alive).map((n) => n.id)
            return alive.includes(ids.A) && alive.includes(ids.B)
        })
    })
    return { A: nodes.A, B: nodes.B, ids }
}

test('A01-B-196 Node A·B에서 같은 때 방 50개씩 → 코드 100개 다 다름', OPTS, async (t) => {
    const { A, B } = await startPair(t)
    const makeMany = (node, tag) => Promise.all(Array.from({ length: 50 }, (_, i) => {
        const uuid = `b196-${tag}-${i}`
        node.connect(uuid)
        return node.create(uuid, { accessType: 'code' })
    }))
    const [fromA, fromB] = await Promise.all([makeMany(A, 'a'), makeMany(B, 'b')])
    const replies = [...fromA, ...fromB]
    assert.deepEqual(replies.filter((r) => !r.ok).map((r) => r.message), [])
    const codes = replies.map((r) => r.room.roomCode)
    assert.equal(new Set(codes).size, 100)
})

test('A01-B-197 Node A 공개 방 → Node B 사람 get_public_rooms에 그 방(node 칸 있음)', OPTS, async (t) => {
    const { A, B, ids } = await startPair(t)
    A.connect('b197-host')
    B.connect('b197-viewer')
    const made = await A.create('b197-host', { accessType: 'open' })
    assert.equal(made.ok, true, made.message)
    A.b.view.flushPublicRoomList(A.io)
    let item = null
    await waitUntil(async () => {
        item = (await B.publicRooms('b197-viewer')).find((r) => r.id === made.room.roomId) ?? null
        return item !== null
    })
    assert.equal(item.node, ids.A)
})

test('A01-B-198 Node A에서 탈주 → Node B에서 create_room → DESERTION_COOLDOWN', OPTS, async (t) => {
    const { A, B } = await startPair(t)
    const r = await A.b.desertion.recordDesertion({ userId: 'b198-runner', gameId: crypto.randomUUID(), reason: 'LEFT_ALIVE' })
    assert.equal(r.ok, true)
    B.connect('b198-runner')
    // B에 막힘이 닿을 때까지: 막히기 전엔 틀린 값(정원 4)이라 방이 안 생기고 값 거절만 옴
    await waitUntil(async () => (await B.create('b198-runner', { maxPlayers: 4 })).code === 'DESERTION_COOLDOWN')
    const reply = await B.create('b198-runner')
    assert.equal(reply.ok, false)
    assert.equal(reply.code, 'DESERTION_COOLDOWN')
    assert.match(reply.message, /^탈주로 /)
})

test('A01-B-199 Node A 5명 방 시작 → Node B 다음 목록에 없음', OPTS, async (t) => {
    const { A, B } = await startPair(t)
    t.mock.method(Math, 'random', () => 0)
    const uuids = ['b199-0', 'b199-1', 'b199-2', 'b199-3', 'b199-4']
    for (const uuid of uuids) A.connect(uuid)
    const made = await A.create(uuids[0], { accessType: 'open', maxPlayers: 5 })
    assert.equal(made.ok, true, made.message)
    for (const uuid of uuids.slice(1)) await A.join(uuid, made.room.roomCode)
    for (const uuid of uuids) {
        const ready = await A.emit(uuid, 'set_ready', { roomId: made.room.roomId, expectedSettingsVersion: 1, isReady: true })
        assert.equal(ready.ok, true, `${uuid} 준비 실패: ${ready.message}`)
    }
    B.connect('b199-viewer')
    A.b.view.flushPublicRoomList(A.io)
    const listedOnB = async () => (await B.publicRooms('b199-viewer')).some((r) => r.id === made.room.roomId)
    await waitUntil(listedOnB)
    const started = await A.emit(uuids[0], 'start_game', { roomId: made.room.roomId, expectedSettingsVersion: 1 })
    assert.equal(started.ok, true, started.message)
    A.b.view.flushPublicRoomList(A.io)
    await waitUntil(async () => !(await listedOnB()))
    assert.equal(await listedOnB(), false)
})

test('A01-B-200 [지금 동작] Node A 비우는 중(drain) → A에서 create_room → 다른 Node로 가라는 답', OPTS, async (t) => {
    const { A, ids } = await startPair(t)
    A.b.cluster.nodes.setDraining(true)
    A.connect('b200-maker')
    const reply = await A.create('b200-maker')
    assert.equal(reply.ok, false)
    assert.equal(reply.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(reply.node, ids.B)
    assert.equal((await A.emit('b200-maker', 'get_current_room', {})).room, null)
})
