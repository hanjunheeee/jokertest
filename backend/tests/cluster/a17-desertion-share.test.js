'use strict'

// 탈주 막힘을 다른 Node도 아는지 시험 — n1 판에서 진짜로 탈주하면 n2(진짜 코드)의 방 만들기·입장이 막히는지, Redis 끊김·n2 다시 켬에도 남는지
// 목록 A17-B-045~059·192 (docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md "탈주 막힘을 다른 Node도 앎"), 돌리기: node --env-file=.env.test --test tests/cluster/a17-desertion-share.test.js
const test = require('node:test')
const assert = require('node:assert/strict')

const W = require('./a17-world')

// Node마다 따로 불러 둔 backend 묶음 (n2b = 다시 켠 n2 자리)
const B = { n1: W.loadBundle(), n2: W.loadBundle() }
const N2_RESTARTED = W.loadBundle()

// 한국 시간 낮 12시 (자정 넘어 그날 횟수가 바뀌지 않게)
const NOON_KST = Date.UTC(2026, 0, 15, 3, 0, 0)
const MIN = 60_000
const COOLDOWN = 'DESERTION_COOLDOWN'
// "탈주로 ○ 뒤에 참여할 수 있습니다." 모양
const WAIT_TEXT = /^탈주로 .+ 뒤에 참여할 수 있습니다\.$/

// 두 Node 켜고 가짜 시계 (낮 12시)
async function setup(t) {
    const w = await W.startNodes(t, { n1: B.n1, n2: B.n2 })
    w.useFakeClock(NOON_KST)
    return w
}

// 정한 사람들로 판 열기 (첫째 방장, 전부 이 Node에 붙임) → { uuids, host, gameId, roomCode, roles, node }
async function openWith(w, node, uuids) {
    for (const uuid of uuids) if (!node.sock(uuid)) node.connect(uuid)
    const [host] = uuids
    const created = await node.createRoom(host, { maxPlayers: uuids.length })
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code} ${created.message}`)
    await w.settle()
    for (const uuid of uuids.slice(1)) {
        const joined = await node.joinByCode(uuid, created.room.roomCode)
        assert.equal(joined?.event, 'room_joined', `${uuid} 입장 실패: ${JSON.stringify(joined?.payload)}`)
    }
    for (const uuid of uuids) {
        const r = await node.setReady(uuid, created.room)
        assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`)
    }
    const reply = await node.start(host, created.room)
    assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`)
    await w.settle()
    const roles = new Map(uuids.map((uuid) => [uuid, node.received(uuid, 'game_started').find((p) => p.gameId === reply.gameId)?.state?.self?.role]))
    return { uuids, host, gameId: reply.gameId, roomCode: created.room.roomCode, roles, node }
}

// 탈주할 사람을 셋째 자리에 넣어 n명 판 → 산 채로 나가기 (시민 자리라 판은 계속 돎)
async function desertGame(w, node, deserter, prefix, n) {
    const others = Array.from({ length: n - 1 }, (_, i) => `${prefix}-${i}`)
    const g = await openWith(w, node, [others[0], others[1], deserter, ...others.slice(2)])
    assert.notEqual(g.roles.get(deserter), 'JOKER', '탈주할 사람이 광대면 판이 바로 끝남')
    const left = await node.leaveGame(deserter, g.gameId)
    assert.equal(left.ok, true, `나가기 실패: ${left.code}`)
    await w.settle()
    return g
}

// 사람 옮기기: from에서 소켓 떼고 to에 새로 붙임 (로비 사람이 다른 Node로 다시 붙는 것과 같음)
function moveTo(from, to, uuid) {
    from.drop(uuid)
    return to.connect(uuid)
}

// 막힘 거절 답 확인 (code·글 모양)
function assertBlocked(reply, label) {
    assert.equal(reply?.ok, false, `${label} 막히지 않음: ${JSON.stringify(reply)}`)
    assert.equal(reply.code, COOLDOWN, label)
    assert.match(reply.message, WAIT_TEXT, label)
}

test('A17-B-045 n1에서 탈주 → 1초 뒤 n2에서 방 만들기 막힘 "4분 59초" (5명 판)', async (t) => {
    const w = await setup(t)
    await desertGame(w, w.n1, 'd045', 'b045', 5)
    w.tick(1_000)
    moveTo(w.n1, w.n2, 'd045')
    const reply = await w.n2.createRoom('d045')
    assertBlocked(reply, 'n2 방 만들기')
    assert.equal(reply.message, '탈주로 4분 59초 뒤에 참여할 수 있습니다.')
    assert.equal(reply.retryAfterMs, 299_000)
})

// 막힘 동안 n2의 다른 입장 길 (값 4)
const OTHER_PATHS = [
    ['A17-B-046', '코드 입장', async (w, uuid) => {
        w.n2.connect('h046')
        const room = await w.n2.createRoom('h046')
        const r = await w.n2.joinByCode(uuid, room.room.roomCode)
        return r?.event === 'room_join_failed' ? { ok: false, ...r.payload } : { ok: true }
    }],
    ['A17-B-047', '공개 방 입장', async (w, uuid) => {
        w.n2.connect('h047')
        const room = await w.n2.createRoom('h047', { accessType: 'open' })
        const r = await w.n2.joinPublic(uuid, room.room.roomId)
        return r?.event === 'room_join_failed' ? { ok: false, ...r.payload } : { ok: true }
    }],
    ['A17-B-048', '초대 수락', async (w, uuid) => w.n2.ask(w.n2.b.MM.handleAcceptGameInvite, uuid, { inviteId: 1 })],
    ['A17-B-049', '자동 매칭', async (w, uuid) => {
        const s = w.n2.sock(uuid)
        const before = s.emitted.length
        await w.n2.b.MM.handleJoinMatchmaking(w.n2.io, s, uuid)
        await w.settle()
        const failed = s.emitted.slice(before).find((e) => e.event === 'room_join_failed')
        return failed ? { ok: false, ...failed.payload } : { ok: true }
    }],
]
for (const [no, label, tryPath] of OTHER_PATHS) {
    test(`${no} n1 탈주 뒤 n2 ${label}도 같은 막힘 글 (6명 판)`, async (t) => {
        const w = await setup(t)
        const uuid = `d${no.slice(-3)}`
        await desertGame(w, w.n1, uuid, `b${no.slice(-3)}`, 6)
        w.tick(1_000)
        moveTo(w.n1, w.n2, uuid)
        const reply = await tryPath(w, uuid)
        assertBlocked(reply, label)
        assert.equal(reply.message, '탈주로 4분 59초 뒤에 참여할 수 있습니다.')
    })
}

test('A17-B-050 n1 판에서 끊기고 60초 뒤 탈락 → n2 방 만들기 막힘 (7명 판)', async (t) => {
    const w = await setup(t)
    const others = Array.from({ length: 6 }, (_, i) => `b050-${i}`)
    const g = await openWith(w, w.n1, [others[0], others[1], 'd050', ...others.slice(2)])
    await w.n1.disconnect('d050')
    w.tick(60_000)
    await w.settle()
    const session = w.n1.session(g.gameId)
    assert.equal(session?.players.get('d050')?.alive, false, '60초 뒤 탈락 안 됨')
    moveTo(w.n1, w.n2, 'd050')
    assertBlocked(await w.n2.createRoom('d050'), 'n2 방 만들기')
})

test('A17-B-051 같은 날 두 번째 탈주를 n2 판에서 → n1 방 만들기 30분 막힘 (5명 판 ×2)', async (t) => {
    const w = await setup(t)
    await desertGame(w, w.n1, 'd051', 'b051a', 5)
    w.tick(5 * MIN + 1_000, 5_000)
    moveTo(w.n1, w.n2, 'd051')
    await desertGame(w, w.n2, 'd051', 'b051b', 5)
    moveTo(w.n2, w.n1, 'd051')
    const reply = await w.n1.createRoom('d051')
    assertBlocked(reply, 'n1 방 만들기')
    assert.equal(reply.message, '탈주로 30분 0초 뒤에 참여할 수 있습니다.')
    assert.equal(reply.retryAfterMs, 30 * MIN)
})

// n1·n2·n1 판 차례로 탈주 (같은 날 세 번째 = 24시간)
async function threeDesertions(w, uuid, prefix) {
    await desertGame(w, w.n1, uuid, `${prefix}a`, 6)
    w.tick(5 * MIN + 1_000, 5_000)
    moveTo(w.n1, w.n2, uuid)
    await desertGame(w, w.n2, uuid, `${prefix}b`, 6)
    w.tick(30 * MIN + 1_000, 5_000)
    moveTo(w.n2, w.n1, uuid)
    await desertGame(w, w.n1, uuid, `${prefix}c`, 6)
    moveTo(w.n1, w.n2, uuid)
}

test('A17-B-052 같은 날 세 번째(Node 번갈아) → n2 거절 "24시간 0분 0초" (6명 판 ×3)', async (t) => {
    const w = await setup(t)
    await threeDesertions(w, 'd052', 'b052')
    const reply = await w.n2.createRoom('d052')
    assertBlocked(reply, 'n2 방 만들기')
    assert.equal(reply.message, '탈주로 24시간 0분 0초 뒤에 참여할 수 있습니다.')
    assert.equal(reply.retryAfterMs, 24 * 60 * MIN)
})

test('A17-B-053 24시간 막힘 뒤 같은 사람 5분 막힘 알림이 늦게 와도 n2 막힘 끝 그대로', async (t) => {
    const w = await setup(t)
    await threeDesertions(w, 'd053', 'b053')
    // 처음 탈주 때 n1이 보낸 진짜 알림 글을 그대로 한 번 더 보냄 (늦게 온 알림)
    const first = w.hub.published.find((p) => p.message.includes('"desertion.blocked"') && p.message.includes('"d053"'))
    assert.ok(first, '처음 탈주 알림을 못 찾음')
    await w.backends.n1.publish(first.channel, first.message)
    await w.settle()
    const reply = await w.n2.createRoom('d053')
    assertBlocked(reply, 'n2 방 만들기')
    assert.equal(reply.retryAfterMs, 24 * 60 * MIN)
})

test('A17-B-054 막힘이 끝나면(5분 1초 뒤) n2에서 방 만들기 됨 (5명 판)', async (t) => {
    const w = await setup(t)
    await desertGame(w, w.n1, 'd054', 'b054', 5)
    w.tick(5 * MIN + 1_000)
    moveTo(w.n1, w.n2, 'd054')
    const reply = await w.n2.createRoom('d054')
    assert.equal(reply.ok, true, `방 만들기 안 됨: ${reply.code} ${reply.message}`)
})

test('A17-B-055 Redis 끊긴 동안 n1 탈주 → 살아나면 n2가 DB 다시 읽어 막음 (7명 판)', async (t) => {
    const w = await setup(t)
    const others = Array.from({ length: 6 }, (_, i) => `b055-${i}`)
    const g = await openWith(w, w.n1, [others[0], others[1], 'd055', ...others.slice(2)])
    w.hub.setDown(true)
    const left = await w.n1.leaveGame('d055', g.gameId)
    assert.equal(left.ok, true)
    await w.settle()
    assert.equal(w.desertionDb.rows.filter((r) => r.user_id === 'd055').length, 1, '가짜 저장소에 줄이 안 생김')
    w.hub.setDown(false)
    // 살아난 뒤 다시 맞추기(0.5초 모음) 지나게
    w.tick(1_000)
    await w.settle()
    moveTo(w.n1, w.n2, 'd055')
    assertBlocked(await w.n2.createRoom('d055'), 'n2 방 만들기')
})

// 다시 켠 n2 손잡이 (켤 때 index.js처럼 탈주 막힘 한 번 읽음): 사람 붙이기·방 만들기만
async function restartN2(w, t) {
    const b = N2_RESTARTED
    await w.kill('n2')
    b.gf.resetCore()
    b.mm.__resetStateForTests()
    b.gs.__resetStateForTests()
    b.desertion.__resetForTests()
    b.mf.installFakeMatchmakingDeps(b.mm)
    b.desertion.__setRepositoryForTests(w.desertionDb)
    await b.cluster.init({
        backend: w.hub.backend(),
        env: { ...W.BASE_ENV, SERVER_ID: 'n2', REDIS_URL: 'memory://' },
        bootEpoch: b.mm.__getBootEpochForTests(),
        log: b.mem.quietLog,
    })
    t.after(async () => {
        await b.cluster.close().catch(() => {})
        b.desertion.__setRepositoryForTests(null)
        b.desertion.__resetForTests()
        b.mm.__resetStateForTests()
    })
    await b.desertion.loadActiveDesertions()
    const registry = new Map()
    b.mm.setOnlineUsersRegistry(registry)
    const io = b.mf.createFakeIo([])
    const sockets = new Map()
    return {
        connect(uuid) {
            const s = b.mf.createFakeSocket(uuid, { id: `n2b-sock-${uuid}` })
            io.sockets.sockets.set(s.id, s)
            registry.set(uuid, s.id)
            sockets.set(uuid, s)
            return s
        },
        createRoom: (uuid) => b.mf.callAsPromise(b.MM.handleCreateRoom, io, sockets.get(uuid), uuid, { accessType: 'code', maxPlayers: 5, jokerCount: 1, ...W.TIMES }),
    }
}

test('A17-B-056 n1 탈주 뒤 n2를 다시 켜도 켤 때 읽어 막힘 남음 (8명 판)', async (t) => {
    const w = await setup(t)
    await desertGame(w, w.n1, 'd056', 'b056', 8)
    const n2 = await restartN2(w, t)
    w.n1.drop('d056')
    n2.connect('d056')
    assertBlocked(await n2.createRoom('d056'), '다시 켠 n2 방 만들기')
})

test('A17-B-057 처형된 뒤 나간 사람은 n2에서 안 막힘 (10명 판)', async (t) => {
    const w = await setup(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b057', n: 10 })
    const target = W.citizenOf(g)
    await W.voteOut(w, g, target)
    assert.equal(w.n1.session(g.gameId)?.players.get(target)?.alive, false, '처형 안 됨')
    const left = await w.n1.leaveGame(target, g.gameId)
    assert.equal(left.ok, true)
    await w.settle()
    moveTo(w.n1, w.n2, target)
    const reply = await w.n2.createRoom(target)
    assert.equal(reply.ok, true, `막힘: ${reply.code} ${reply.message}`)
})

test('A17-B-058 판 끝 결과 화면에서 나간 사람은 n2에서 안 막힘 (10명 판)', async (t) => {
    const w = await setup(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b058', n: 10 })
    await W.playToEnd(w, g)
    const target = W.citizenOf(g)
    const left = await w.n1.leaveGame(target, g.gameId)
    assert.equal(left.ok, true)
    await w.settle()
    moveTo(w.n1, w.n2, target)
    const reply = await w.n2.createRoom(target)
    assert.equal(reply.ok, true, `막힘: ${reply.code} ${reply.message}`)
})

test('A17-B-059 사람 칸 없는 막힘 알림은 n2가 버림, 오류 없음', async (t) => {
    const w = await setup(t)
    const errors = []
    const onError = (e) => errors.push(String(e?.message ?? e))
    process.on('unhandledRejection', onError)
    process.on('uncaughtException', onError)
    t.after(() => {
        process.off('unhandledRejection', onError)
        process.off('uncaughtException', onError)
    })
    const now = Date.now()
    // uuid 칸 없이 (다른 이름 칸에 사람을 넣어 보냄)
    const sent = await w.n1.cluster.bus.publish('desertion.blocked', { userId: 'v059', gameId: 'g059', desertedAt: now, blockedUntil: now + 5 * MIN })
    assert.equal(sent, true)
    await w.settle()
    w.n2.connect('v059')
    const reply = await w.n2.createRoom('v059')
    assert.equal(reply.ok, true, `막힘: ${reply.code} ${reply.message}`)
    assert.deepEqual(errors, [])
})

// 브라우저 A17-H-023에서 나옴: Redis가 잠깐 멈추면 일하던 n1만 끊김을 느끼고 n2는 못 느낌 → n2는 다시 맞추기를 안 함
test('A17-B-192 n1만 Redis 끊긴 동안 n1 탈주 → n1이 살아나면 끊김을 못 느낀 n2도 DB 다시 읽어 막음 (7명 판)', async (t) => {
    const w = await setup(t)
    const others = Array.from({ length: 6 }, (_, i) => `b192-${i}`)
    const g = await openWith(w, w.n1, [others[0], others[1], 'd192', ...others.slice(2)])
    w.setDown('n1', true)
    const left = await w.n1.leaveGame('d192', g.gameId)
    assert.equal(left.ok, true)
    await w.settle()
    assert.equal(w.desertionDb.rows.filter((r) => r.user_id === 'd192').length, 1, '가짜 저장소에 줄이 안 생김')
    assert.equal(w.n2.cluster.state(), 'up', '준비: n2는 끊김을 못 느낌')
    w.setDown('n1', false)
    await w.settle()
    // 다시 맞추기(0.5초 모음) 지나게
    w.tick(1_000)
    await w.settle()
    moveTo(w.n1, w.n2, 'd192')
    assertBlocked(await w.n2.createRoom('d192'), 'n2 방 만들기')
})
