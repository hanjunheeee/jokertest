'use strict'

// 서버 2대(메모리 Redis)에서 요청 수 제한·틀린 횟수·코드 입장 시도를 두 Node가 합쳐 세는지, 공지·공개 방 목록이 두 Node를 다 보는지 보는 시험
// 목록 A17-B-070~080 (docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md "요청 수 제한·틀린 횟수 Node 넘어 합침 · 목록 · 공지")
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const express = require('express')

const W = require('./a17-world')
const { listenOnFetchablePort, HIGH_PORT_MIN, HIGH_PORT_MAX } = require('../helpers/fetchablePort')

// Node마다 따로 불러 둘 것 (나중에 require하면 다른 Node 것이 나와서 미리)
const EXTRA = [
    'routes/user.routes', 'routes/auth.routes', 'routes/economy.routes', 'routes/friend.routes', 'routes/report.routes',
    'repositories/user', 'middlewares/auth.middleware', 'services/ops/announcements', 'socket/connection/presence',
    'socket/emitter', 'services/presence/status', 'repositories/presence/onlinePresence', 'utils/auth/credentials',
]
const B = { n1: W.loadBundle({ extra: EXTRA }), n2: W.loadBundle({ extra: EXTRA }) }

// 맞는 비번·틀린 비번 (가짜 계정 하나가 씀)
const RIGHT_PW = 'Right-pass-1!'
const WRONG_PW = 'Wrong-pass-9!'
const NEW_PW = 'Newpass-77!x'
let rightHash = null
const hashOnce = async () => { rightHash ??= await B.n1.x['utils/auth/credentials'].hashPassword(RIGHT_PW); return rightHash }

// 함수 안에서 늦게 require하는 곳(cluster·emitter)이 그 Node 것을 보게 잠깐 바꿔 끼움 (a17-world에 올릴 것)
const LAZY = { cluster: 'cluster/index.js', 'socket/emitter': 'socket/emitter.js' }
async function asNode(node, fn) {
    const saved = []
    for (const [name, rel] of Object.entries(LAZY)) {
        const file = path.join(W.BACKEND, rel)
        saved.push([file, require.cache[file]])
        const exportsOf = name === 'cluster' ? node.b.cluster : node.b.x[name]
        require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsOf, children: [], paths: [] }
    }
    try {
        return await fn()
    } finally {
        for (const [file, mod] of saved) {
            if (mod) require.cache[file] = mod
            else delete require.cache[file]
        }
    }
}

// 경로 하나의 처리기 줄 꺼냄 (로그인 확인 verifyToken은 빼고 가짜 로그인으로 대신), lastOk면 맨 끝 처리기를 200 답으로
function routeHandlers(b, routerName, method, routePath, { lastOk = false } = {}) {
    const router = b.x[routerName]
    const layer = router.stack.find((l) => l.route?.path === routePath && l.route.methods[method])
    assert.ok(layer, `${routerName} ${method} ${routePath} 경로 없음`)
    const verifyToken = b.x['middlewares/auth.middleware'].verifyToken
    const handlers = layer.route.stack.map((l) => l.handle).filter((h) => h !== verifyToken)
    if (lastOk) handlers[handlers.length - 1] = (req, res) => res.status(200).json({ ok: true })
    return handlers
}

// Node 하나 HTTP 앱 (x-user 머리글 = 로그인한 사람), 그 Node 묶음의 진짜 경로 처리기를 씀
async function startApp(t, node, routes) {
    const app = express()
    app.use(express.json())
    app.use((req, res, next) => { req.user = { uuid: req.headers['x-user'], sessionId: 's-1' }; next() })
    for (const r of routes) app[r.method](r.path, ...r.handlers)
    app.use((err, req, res, next) => { void next; res.status(err.status ?? 500).json({ code: err.code ?? 'ERR', message: err.message }) })
    const server = http.createServer(app)
    // 포트는 crypto로 고름 (시험 세상이 Math.random을 0으로 고정하면 늘 같은 포트가 나옴)
    const { url } = await listenOnFetchablePort(server, { pickPort: () => HIGH_PORT_MIN + crypto.randomInt(HIGH_PORT_MAX - HIGH_PORT_MIN + 1) })
    t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }))
    return async (method, p, { user = null, body = {} } = {}) => {
        const res = await fetch(`${url}${p}`, {
            method: method.toUpperCase(),
            headers: { 'content-type': 'application/json', connection: 'close', ...(user ? { 'x-user': user } : {}) },
            body: JSON.stringify(body),
        })
        return { status: res.status, body: await res.json().catch(() => null) }
    }
}

// 가짜 계정 저장소 (비번 바꾸기·탈퇴가 쓰는 함수만, DB 대신)
async function fakeUserRepo(t, b, uuid) {
    const hash = await hashOnce()
    const repo = b.x['repositories/user']
    const user = { uuid, password_hash: hash, has_local_password: true, email: `${uuid}@example.test` }
    t.mock.method(repo, 'withTransaction', async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }))
    t.mock.method(repo, 'findByUuid', async (id) => (id === uuid ? { ...user } : null))
    t.mock.method(repo, 'updateUser', async () => [1])
    t.mock.method(repo, 'markOnlineSessionsOffline', async () => 0)
}

// 비번 바꾸기 앱 두 개 (n1·n2)
async function passwordApps(t, w, uuid) {
    const send = {}
    for (const id of ['n1', 'n2']) {
        await fakeUserRepo(t, w[id].b, uuid)
        send[id] = await startApp(t, w[id], [{ method: 'patch', path: '/me/password', handlers: routeHandlers(w[id].b, 'routes/user.routes', 'patch', '/me/password') }])
    }
    const change = (id, currentPassword) => send[id]('patch', '/me/password', { user: uuid, body: { currentPassword, newPassword: NEW_PW } })
    return change
}

const LOCKED_PW_MESSAGE = /^현재 비밀번호를 여러 번 잘못 입력했습니다/

test('A17-B-070 현재 비번 틀린 횟수를 두 Node가 합쳐 셈: n1 3번 + n2 2번 → 6번째(n2) 맞는 비번이어도 429', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B, { fixedRandom: false })
    const change = await passwordApps(t, w, 'u070')
    for (let i = 0; i < 3; i += 1) assert.equal((await change('n1', WRONG_PW)).status, 400, `n1 ${i + 1}번째`)
    for (let i = 0; i < 2; i += 1) assert.equal((await change('n2', WRONG_PW)).status, 400, `n2 ${i + 1}번째`)
    const sixth = await change('n2', RIGHT_PW)
    assert.equal(sixth.status, 429)
    assert.match(sixth.body.message, LOCKED_PW_MESSAGE)
})

test('A17-B-071 탈퇴 비번 틀린 횟수도 합쳐 셈: n1 3번 + n2 2번 → 6번째 거절', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B, { fixedRandom: false })
    const send = {}
    for (const id of ['n1', 'n2']) {
        await fakeUserRepo(t, w[id].b, 'u071')
        send[id] = await startApp(t, w[id], [{ method: 'post', path: '/me/withdraw', handlers: routeHandlers(w[id].b, 'routes/user.routes', 'post', '/me/withdraw') }])
    }
    const withdraw = (id, password) => send[id]('post', '/me/withdraw', { user: 'u071', body: { password } })
    for (let i = 0; i < 3; i += 1) assert.equal((await withdraw('n1', WRONG_PW)).status, 400, `n1 ${i + 1}번째`)
    for (let i = 0; i < 2; i += 1) assert.equal((await withdraw('n2', WRONG_PW)).status, 400, `n2 ${i + 1}번째`)
    const sixth = await withdraw('n1', RIGHT_PW)
    assert.equal(sixth.status, 429)
    assert.equal(sixth.body.code, 'WITHDRAW_LOCKED')
})

// 방 없음 답 글 (코드 입장이 없는 코드에 주는 답)
const NO_ROOM = /방이 없습니다/

// 없는 코드로 n1 10번 + n2 10번 시도 (전부 "방 없음" 답이어야 함)
async function tryMissingCodes(w, uuid) {
    w.n1.connect(uuid)
    w.n2.connect(uuid)
    for (const id of ['n1', 'n2']) {
        for (let i = 0; i < 10; i += 1) {
            const r = await w[id].joinByCode(uuid, 'ZZZZZZ')
            assert.match(r?.payload?.message ?? '', NO_ROOM, `${id} ${i + 1}번째: ${JSON.stringify(r)}`)
        }
    }
}

test('A17-B-072 방 코드 입장 시도 1분 20번을 합쳐 셈: n1 10번 + n2 10번 → 21번째(n1) 시도 제한 거절', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B, { fixedRandom: false })
    await tryMissingCodes(w, 'u072')
    const r21 = await w.n1.joinByCode('u072', 'ZZZZZZ')
    assert.equal(r21?.event, 'room_join_failed')
    assert.equal(r21.payload.code, 'TOO_MANY_JOIN_ATTEMPTS')
})

test('A17-B-073 로그인 ip 10분 50번을 합쳐 셈: n1 25번 + n2 25번 → 51번째 429', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B, { fixedRandom: false })
    const send = {}
    for (const id of ['n1', 'n2']) {
        send[id] = await startApp(t, w[id], [{ method: 'post', path: '/login', handlers: routeHandlers(w[id].b, 'routes/auth.routes', 'post', '/login') }])
    }
    // 빈 본문 로그인 = 400 (DB 안 감), 제한은 400이어도 셈
    for (const id of ['n1', 'n2']) {
        for (let i = 0; i < 25; i += 1) assert.notEqual((await send[id]('post', '/login')).status, 429, `${id} ${i + 1}번째`)
    }
    const r51 = await send.n1('post', '/login')
    assert.equal(r51.status, 429)
    assert.equal(r51.body.message, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.')
})

test('A17-B-074 Redis 죽은 동안은 Node마다 따로 셈: n1 5번 + n2 5번 틀림 → 각 Node 6번째에서야 거절', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B, { fixedRandom: false })
    const change = await passwordApps(t, w, 'u074')
    w.hub.setDown(true)
    for (const id of ['n1', 'n2']) {
        for (let i = 0; i < 5; i += 1) assert.equal((await change(id, WRONG_PW)).status, 400, `${id} ${i + 1}번째 (앞 Node 것과 안 합쳐야 400)`)
    }
    for (const id of ['n1', 'n2']) {
        const sixth = await change(id, RIGHT_PW)
        assert.equal(sixth.status, 429, `${id} 6번째`)
        assert.match(sixth.body.message, LOCKED_PW_MESSAGE)
    }
})

test('A17-B-075 코드 입장 제한 창(1분)이 지나면 다른 Node에서 다시 받아 줌 (방 없음 답)', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B, { fixedRandom: false })
    w.useFakeClock()
    await tryMissingCodes(w, 'u075')
    assert.equal((await w.n1.joinByCode('u075', 'ZZZZZZ'))?.payload?.code, 'TOO_MANY_JOIN_ATTEMPTS')
    w.tick(60_000)
    const after = await w.n2.joinByCode('u075', 'ZZZZZZ')
    assert.equal(after?.event, 'room_join_failed')
    assert.match(after.payload.message, NO_ROOM)
})

// 그 밖 요청 제한: 값 하나 = 경로 하나 (한도·나눠 보낼 수·막힘 글)
const OTHER_LIMITS = [
    { no: '076', name: '쿠폰', router: 'routes/economy.routes', path: '/coupons/redeem', max: 10, message: '쿠폰 입력이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    { no: '077', name: '친구 신청', router: 'routes/friend.routes', path: '/requests', max: 20, message: '친구 신청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    { no: '078', name: '신고', router: 'routes/report.routes', path: '/', max: 5, message: '신고가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
]
for (const c of OTHER_LIMITS) {
    test(`A17-B-${c.no} ${c.name} 요청 제한도 합쳐 셈: 한도 ${c.max}을 n1·n2 절반씩 → ${c.max + 1}번째 429`, { timeout: 30000 }, async (t) => {
        const w = await W.startNodes(t, B, { fixedRandom: false })
        const send = {}
        for (const id of ['n1', 'n2']) {
            send[id] = await startApp(t, w[id], [{ method: 'post', path: '/x', handlers: routeHandlers(w[id].b, c.router, 'post', c.path, { lastOk: true }) }])
        }
        const user = `u${c.no}`
        const half = Math.ceil(c.max / 2)
        for (let i = 0; i < c.max; i += 1) {
            const id = i < half ? 'n1' : 'n2'
            assert.equal((await send[id]('post', '/x', { user })).status, 200, `${id} ${i + 1}번째`)
        }
        const over = await send.n2('post', '/x', { user })
        assert.equal(over.status, 429)
        assert.equal(over.body.message, c.message)
    })
}

test('A17-B-079 공지 대상 "접속자"가 두 Node 사람 전부: n1 2명 + n2 2명 → 4명 모두 알림', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B, { fixedRandom: false })
    // 접속 줄 표 (DB 하나를 두 Node가 같이 씀) — 진짜 접속 처리(handleConnection)가 저장소로 씀
    const presence = new Map()
    for (const id of ['n1', 'n2']) {
        const b = w[id].b
        t.mock.method(b.x['repositories/presence/onlinePresence'], 'upsertOnlinePresence', async (userId, status, serverId) => {
            presence.set(userId, { user_id: userId, status, server_id: serverId })
        })
        t.mock.method(b.x['services/presence/status'], 'getAcceptedFriendUuids', async () => [])
    }
    const people = { n1: ['a079-1', 'a079-2'], n2: ['b079-1', 'b079-2'] }
    for (const id of ['n1', 'n2']) {
        const b = w[id].b
        for (const uuid of people[id]) {
            const socket = w[id].connect(uuid)
            await asNode(w[id], () => b.x['socket/connection/presence'].handleConnection(w[id].io, socket, uuid))
        }
    }
    await W.settle()
    // 공지 저장 (알림 표 대신 받은 사람 기록)
    const saved = []
    const notificationService = {
        NOTIFICATION_TYPES: { SYSTEM: 'SYSTEM' },
        createNotification: async ({ userId }) => { saved.push(userId); return { created: true, notification: { userId } } },
        emitNotificationCreated: () => {},
    }
    const db = { OnlinePresence: { findAll: async () => [...presence.values()].filter((r) => r.status === 'ONLINE') } }
    const n1 = w.n1.b
    const result = await n1.x['services/ops/announcements'].sendAnnouncement(
        { announcementId: 'a17-079', title: '공지', body: '두 Node 모두', target: 'online' },
        { notificationService, onlineUsers: n1.x['socket/emitter'].onlineUsers, db, cluster: n1.cluster },
    )
    assert.equal(result.recipientCount, 4)
    assert.deepEqual([...saved].sort(), [...people.n1, ...people.n2].sort())
})

test('A17-B-080 공개 방 목록에 두 Node 방이 다 보임: n1 공개 방 1 + n2 공개 방 1 → 두 Node 목록에 둘 다', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B, { fixedRandom: false })
    const made = {}
    for (const id of ['n1', 'n2']) {
        w[id].connect(`h080-${id}`)
        const created = await w[id].createRoom(`h080-${id}`, { accessType: 'open', title: `방-${id}` })
        assert.equal(created.ok, true, `${id} 방 만들기 실패: ${created.message}`)
        made[id] = created.room.roomId
    }
    const ids = async (id) => (await w[id].publicRooms()).rooms.map((r) => r.id).sort()
    const want = [made.n1, made.n2].sort()
    // 목록 묶어 보내기(0.5초)·버스 스냅샷이 오갈 때까지 (최대 3초)
    for (let i = 0; i < 150; i += 1) {
        if (JSON.stringify(await ids('n1')) === JSON.stringify(want) && JSON.stringify(await ids('n2')) === JSON.stringify(want)) break
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.deepEqual(await ids('n1'), want)
    assert.deepEqual(await ids('n2'), want)
})
