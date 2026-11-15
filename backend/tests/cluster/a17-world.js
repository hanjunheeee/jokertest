'use strict'

// 서버 여러 대 시험 판 차리기 (a17 시험 파일만 씀) — 한 프로세스에 backend 코드를 Node 수만큼 따로 불러 n1·n2를 둘 다 진짜 코드로 띄움
// 받침은 메모리 Redis(hub) 또는 진짜 시험 Redis, 사람·방·판은 가짜 소켓·가짜 io로 진짜 핸들러 길을 감 (DB는 막고 필요한 것만 가짜 저장소)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const path = require('node:path')
const assert = require('node:assert/strict')

const BACKEND = path.resolve(__dirname, '../..')
const SEP = path.sep
// backend 코드 파일인지 (node_modules는 Node끼리 같이 씀)
const isBackendFile = (file) => file.startsWith(BACKEND + SEP) && !file.includes(`${SEP}node_modules${SEP}`)

// backend 파일을 처음부터 다시 불러 따로 된 묶음 만들기 (불러온 뒤 원래 불러 둔 것은 그대로 되돌림)
// 장부·cluster 싱글턴이 묶음마다 따로라 한 프로세스에서 Node 둘이 서로 모르는 채로 돎
// 조심: 함수 안에서 늦게 require하는 곳(/health의 cluster·models, 공지·업적의 emitter 등)은 묶음 것이 아니라 시험 파일 캐시 것을 집음
// 조심: startNodes가 Math.random을 0으로 묶음 → listenOnFetchablePort는 pickPort를 crypto 무작위로 넘김(안 그러면 늘 같은 포트)
// 조심: 판 타이머는 걸릴 때의 setTimeout을 씀 → useFakeClock은 openGame 전에 켬
function loadFresh(load) {
    const saved = new Map()
    for (const key of Object.keys(require.cache)) {
        if (!isBackendFile(key)) continue
        saved.set(key, require.cache[key])
        delete require.cache[key]
    }
    try {
        return load((rel) => require(path.join(BACKEND, rel)))
    } finally {
        for (const key of Object.keys(require.cache)) if (isBackendFile(key)) delete require.cache[key]
        for (const [key, mod] of saved) require.cache[key] = mod
    }
}

// Node 하나 몫 모듈 묶음, extra = 더 불러 둘 backend 상대 경로 (나중에 require하면 다른 묶음 것이 나와서 미리)
// 파일 맨 위에서 Node마다 한 번 (불러오기가 무거움), 시험마다 startNodes가 장부를 비움
// databaseUrl = 시험 DB 주소 (Redis·DB 시험만, 없으면 DB는 닿지 않는 곳으로 막음 — gameFixtures가 막은 뒤 다시 넣음)
function loadBundle({ extra = [], databaseUrl = null } = {}) {
    return loadFresh((r) => {
        const gf = r('tests/audit-2026-11-09/gameFixtures')
        if (databaseUrl) process.env.DATABASE_URL = databaseUrl
        const mf = r('tests/helpers/matchmakingFixtures')
        const mm = r('socket/matchmaking')
        const gs = r('socket/gameSession')
        const bundle = {
            gf, mf, mm, gs,
            MM: mm.__testables,
            G: gs.__testables,
            cluster: r('cluster'),
            mem: r('cluster/testing/memoryCluster'),
            core: r('game-core/gameSession'),
            byId: r('game-core/queries/byId'),
            desertion: r('services/game/desertion'),
            loc: r('socket/connection/locationSync'),
            routing: r('socket/connection/nodeRouting'),
            roomRouting: r('socket/matchmaking/cluster/roomRouting'),
            roomDirectory: r('socket/matchmaking/cluster/roomDirectory'),
            roomListSync: r('socket/matchmaking/cluster/roomListSync'),
            entryLimits: r('socket/matchmaking/join/entryLimits'),
            returnRoom: r('socket/matchmaking/room/returnRoom'),
            lobbyEntry: r('socket/matchmaking/room/lobbyEntry'),
            e2eHooks: r('socket/e2e/gameHooks'),
            x: {},
        }
        for (const rel of extra) bundle.x[rel] = r(rel)
        return bundle
    })
}

// 방 시간: 방 설정 최소값 (토론·투표 30초, 재판 15초, 밤 30초)
const TIMES = { dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 }

// 하트비트 30ms (진짜 시계), 죽음 판정은 길게 (가짜 시계를 넘겨도 Node가 죽은 것으로 안 보이게, 죽음은 close로 냄)
const BASE_ENV = { CLUSTER_HEARTBEAT_MS: '30', NODE_DEAD_AFTER_MS: String(2 * 24 * 60 * 60 * 1000), PRESENCE_OFFLINE_DELAY_MS: '0' }

// 같은 차례 일(버스 setImmediate·위치 맞추기 queueMicrotask·디렉터리 쓰기 Promise) 끝날 때까지
async function settle(rounds = 8) {
    for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

// 탈주 기록 가짜 저장소 (모든 Node가 같이 씀 = DB 하나), rows는 DB 줄 모양
function createDesertionDb() {
    const rows = []
    const ms = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime())
    return {
        rows,
        countDesertionsSince: async ({ userId, since, excludeGameId }) =>
            rows.filter((r) => r.user_id === userId && ms(r.deserted_at) >= ms(since) && r.game_id !== excludeGameId).length,
        insertDesertion: async ({ userId, gameId, reason, desertedAt, blockedUntil }) => {
            const found = rows.find((r) => r.user_id === userId && r.game_id === gameId)
            if (found) return { created: false, row: found }
            const row = { user_id: userId, game_id: gameId, reason, deserted_at: new Date(desertedAt), blocked_until: new Date(blockedUntil) }
            rows.push(row)
            return { created: true, row }
        },
        findDesertionsForWarmup: async ({ now, todayStart }) =>
            rows.filter((r) => ms(r.blocked_until) > ms(now) || ms(r.deserted_at) >= ms(todayStart)),
    }
}

// 묶음 장부 비우기 + 가짜 의존 끼우기 (시험 앞뒤로)
function resetBundle(b, desertionDb) {
    b.gf.resetCore()
    b.mm.__resetStateForTests()
    b.gs.__resetStateForTests()
    b.roomDirectory.__resetRoomDirectoryForTests()
    b.roomListSync.__resetRoomListSyncForTests()
    b.entryLimits.__resetEntryLimitsForTests()
    b.desertion.__resetForTests()
    b.loc.__stopLocationSyncForTests()
    b.e2eHooks.clearRolePresets?.()
    b.mf.installFakeMatchmakingDeps(b.mm)
    b.G.__setRecordVoteParticipationForTests(async () => {})
    b.G.__setEvaluateAchievementsForTests(async () => {})
    b.G.__setGameResultPersistForTests(async () => ({ ok: true }))
    b.desertion.__setRepositoryForTests(desertionDb)
}

function clearHooks(b) {
    b.G.__setRecordVoteParticipationForTests(null)
    b.G.__setEvaluateAchievementsForTests(null)
    b.G.__setGameResultPersistForTests(null)
    b.desertion.__setRepositoryForTests(null)
}

// Node 한 대 손잡이: 이 Node에 붙은 사람 소켓·가짜 io·핸들러 부르기
function makeNode(t, id, b) {
    const registry = new Map()
    b.mm.setOnlineUsersRegistry(registry)
    b.gs.setOnlineUsersRegistry(registry)
    const io = b.mf.createFakeIo([])
    const sockets = new Map()
    let seq = 0
    const node = {
        id, b, io, registry, sockets,
        cluster: b.cluster,
        // 이 Node에 사람 하나 붙임 (같은 사람이 다시 붙으면 새 소켓이 지금 소켓)
        connect(uuid) {
            seq += 1
            const s = b.mf.createFakeSocket(uuid, { id: `${id}-sock-${uuid}-${seq}` })
            io.sockets.sockets.set(s.id, s)
            registry.set(uuid, s.id)
            sockets.set(uuid, s)
            return s
        },
        // 이 Node에서 소켓 떼기 (다른 Node로 옮김, 끊김 처리는 안 함)
        drop(uuid) {
            const s = sockets.get(uuid)
            if (!s) return
            s.connected = false
            io.sockets.sockets.delete(s.id)
            if (registry.get(uuid) === s.id) registry.delete(uuid)
            sockets.delete(uuid)
        },
        sock: (uuid) => sockets.get(uuid),
        received: (uuid, event) => (sockets.get(uuid)?.received ?? []).filter((e) => e.event === event).map((e) => e.payload),
        // 답 함수 있는 핸들러 부르기 → 답
        ask: (handler, uuid, payload) => b.mf.callAsPromise(handler, io, sockets.get(uuid), uuid, payload),
        createRoom: (uuid, overrides = {}) => b.mf.callAsPromise(
            b.MM.handleCreateRoom, io, sockets.get(uuid), uuid, { accessType: 'code', maxPlayers: 5, jokerCount: 1, ...TIMES, ...overrides },
        ),
        // 코드 입장 → 이번에 받은 입장 결과 하나 { event, payload } (room_joined / room_join_failed)
        async joinByCode(uuid, code) {
            const s = sockets.get(uuid)
            const before = s.emitted.length
            await b.MM.handleJoinRoomByCode(io, s, uuid, code)
            await settle()
            return lastJoinResult(s, before)
        },
        async joinPublic(uuid, roomId) {
            const s = sockets.get(uuid)
            const before = s.emitted.length
            await b.MM.handleJoinPublicRoom(io, s, uuid, { roomId })
            await settle()
            return lastJoinResult(s, before)
        },
        publicRooms: () => new Promise((resolve) => b.MM.handleGetPublicRooms(resolve)),
        setReady: (uuid, room, ready = true) => b.mf.callAsPromise(b.MM.handleSetReady, io, sockets.get(uuid), uuid, b.mf.readyPayload(room, ready)),
        start: (uuid, room) => b.mf.callAsPromise(b.MM.handleStartGame, io, sockets.get(uuid), uuid, b.mf.startPayload(room)),
        returnToRoom: (uuid, gameId) => b.mf.callAsPromise(b.returnRoom.handleReturnToRoom, io, sockets.get(uuid), uuid, { gameId }),
        enterLobby: (uuid) => new Promise((resolve) => b.lobbyEntry.handleEnterLobby(io, sockets.get(uuid), uuid, resolve)),
        leaveGame: (uuid, gameId) => b.mf.callAsPromise(b.G.handleLeaveGameSession, io, sockets.get(uuid), uuid, { gameId }),
        // 끊김: 소켓 끊고 판 끊김 처리 (60초 기다림 시작)
        async disconnect(uuid) {
            const s = sockets.get(uuid)
            s.connected = false
            await b.gs.onDisconnect(io, s, uuid)
        },
        session: (gameId) => b.byId.getSessionById(gameId),
        // 접속 길잡이 미들웨어 한 번 → 거절 오류 또는 null(받음), query = 힌트(?node=)
        route: (uuid, query = {}) => new Promise((resolve) => b.routing.nodeRouting(
            { data: { user: { uuid } }, handshake: { query } }, (err) => resolve(err ?? null),
        )),
        dirKeys: () => b.cluster.directory.keys(),
        readKey: async (key) => (await b.cluster.directory.read(key)).value,
    }
    return node
}

// 이번 emit 뒤 입장 결과 하나
function lastJoinResult(socket, before) {
    const tail = socket.emitted.slice(before).filter((e) => e.event === 'room_joined' || e.event === 'room_join_failed')
    const last = tail.at(-1)
    return last ? { event: last.event, payload: last.payload } : null
}

// Node 여러 대 켜기: bundles = { n1: 묶음, n2: 묶음 }, 받침 = 메모리 hub(기본) 또는 진짜 Redis(redisUrls: { n1: url })
// env = 모든 Node 환경값, nodeEnv = { n2: {...} } 그 Node만
// 돌려줌: { nodes: { n1, n2 }, n1, n2, hub, backends, desertionDb, settle, refresh, tick, useFakeClock }
async function startNodes(t, bundles, { env = {}, nodeEnv = {}, redisUrls = null, prefix = null, initOrder = null, fixedRandom = true } = {}) {
    const ids = initOrder ?? Object.keys(bundles)
    const desertionDb = createDesertionDb()
    const first = bundles[ids[0]]
    const hub = redisUrls ? null : first.mem.createMemoryHub()
    const backends = {}
    const nodes = {}
    for (const id of ids) resetBundle(bundles[id], desertionDb)
    t.after(async () => {
        for (const id of ids) {
            await bundles[id].cluster.close().catch(() => {})
        }
        if (hub) await hub.close()
        for (const id of ids) {
            resetBundle(bundles[id], desertionDb)
            clearHooks(bundles[id])
        }
    })
    for (const id of ids) {
        const b = bundles[id]
        b.loc.startLocationSync()
        const allEnv = { SERVER_ID: id, ...BASE_ENV, ...env, ...(nodeEnv[id] ?? {}) }
        if (redisUrls) {
            Object.assign(allEnv, { REDIS_URL: redisUrls[id], REDIS_KEY_PREFIX: prefix })
            await b.cluster.init({ env: allEnv, bootEpoch: b.mm.__getBootEpochForTests(), log: first.mem.quietLog })
        } else {
            backends[id] = hub.backend()
            await b.cluster.init({ backend: backends[id], env: { ...allEnv, REDIS_URL: 'memory://' }, bootEpoch: b.mm.__getBootEpochForTests(), log: first.mem.quietLog })
        }
        nodes[id] = makeNode(t, id, b)
    }
    // 직업 고정: 직업 나누기 무작위를 0으로 (판마다 같은 직업)
    if (fixedRandom) t.mock.method(Math, 'random', () => 0)
    const refresh = async () => { for (const id of ids) await bundles[id].cluster.nodes.refresh().catch(() => {}) }
    // 모든 Node가 서로를 볼 때까지 (첫 하트비트가 늦게 들어감, 최대 3초)
    const seesAll = () => ids.every((id) => {
        const seen = new Set(bundles[id].cluster.nodes.list().map((n) => n.id))
        return ids.every((other) => seen.has(other))
    })
    for (let i = 0; i < 150 && !seesAll(); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20))
        await refresh()
    }
    const world = {
        t, ids, nodes, hub, backends, desertionDb, settle, refresh, ...nodes,
        // 가짜 시계 켜기 (setTimeout·Date), 지금 시각 그대로 시작 → Redis 키 수명이 갑자기 안 지남
        useFakeClock(now = Date.now()) {
            t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now })
            world.clockOn = true
        },
        clockOn: false,
        // 가짜 시계를 잘게 넘김 (한 번에 넘긴 시간 끝 시각으로 타이머를 불러서 경계는 1초씩)
        tick(ms, step = 1_000) {
            let left = ms
            while (left > 0) {
                const n = Math.min(step, left)
                t.mock.timers.tick(n)
                left -= n
            }
        },
        // 판 상태가 맞을 때까지 1초씩 (판을 끝까지 몰고 갈 때만)
        advanceUntil(node, gameId, done, limitMs = 900_000) {
            for (let spent = 0; spent <= limitMs; spent += 1_000) {
                const session = node.session(gameId)
                if (!session || done(session)) return session
                t.mock.timers.tick(1_000)
            }
            throw new Error(`판이 ${limitMs}ms 안에 원하는 상태가 안 됨`)
        },
        // 이 Node 하나만 Redis 끊기·살리기 (메모리 받침)
        setDown(id, down) { backends[id].setDown(down) },
        // Node 죽음 (하트비트 지움·연결 닫음, 써 둔 디렉터리 키는 남음 = 강제 종료와 같음), 다른 Node가 바로 알게 다시 읽음
        async kill(id) {
            await bundles[id].cluster.close()
            await refresh()
        },
    }
    return world
}

// ── 대기방 → 판 → 판 끝 (가짜 시계 켠 뒤에만) ──

// 방 만들고 사람들 코드 입장·준비·시작 → { uuids, host, gameId, roomCode, roomId, roles(uuid → 직업) }
// players: 이 Node에 붙일 사람 uuid 목록 (첫째 방장), 다른 Node에서 옮겨 온 사람은 movers로 (그 Node에서 먼저 코드 입장 → 옮기라는 답 → 여기로)
async function openGame(w, node, { prefix, n, accessType = 'code', maxPlayers = n, movers = null, title } = {}) {
    const uuids = Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
    const moverSet = new Set(movers?.uuids ?? [])
    for (const uuid of uuids) if (!moverSet.has(uuid)) node.connect(uuid)
    const [host] = uuids
    const created = await node.createRoom(host, { accessType, maxPlayers, ...(title ? { title } : {}) })
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code} ${created.message}`)
    await w.settle()
    const code = created.room.roomCode
    for (const uuid of uuids.slice(1)) {
        if (moverSet.has(uuid)) {
            const from = movers.from
            from.connect(uuid)
            const first = await from.joinByCode(uuid, code)
            assert.equal(first?.payload?.code, 'ROOM_ON_OTHER_NODE', `${uuid} 옮기라는 답이 아님: ${JSON.stringify(first)}`)
            from.drop(uuid)
            node.connect(uuid)
        }
        const joined = await node.joinByCode(uuid, code)
        assert.equal(joined?.event, 'room_joined', `${uuid} 입장 실패: ${JSON.stringify(joined?.payload)}`)
    }
    const room = created.room
    for (const uuid of uuids) {
        const r = await node.setReady(uuid, room)
        assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`)
    }
    const reply = await node.start(host, room)
    assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`)
    await w.settle()
    const roles = new Map(uuids.map((uuid) => {
        const p = node.received(uuid, 'game_started').find((x) => x.gameId === reply.gameId)
        return [uuid, p?.state?.self?.role]
    }))
    return { uuids, host, gameId: reply.gameId, roomCode: code, roomId: room.roomId, roles, node }
}

// 낮에 한 사람을 표로 재판에 세우고 전원 유죄로 처형 (피고는 기권)
async function voteOut(w, g, target) {
    const { node } = g
    const session = w.advanceUntil(node, g.gameId, (s) => s.phase === 'DAY')
    const alive = [...session.players.values()].filter((p) => p.alive && p.isParticipating !== false).map((p) => p.uuid)
    for (const uuid of alive) await node.ask(node.b.G.handleAcknowledgeDayVoteReady, uuid, { gameId: g.gameId })
    for (const uuid of alive) {
        const r = await node.ask(node.b.G.handleSubmitDayVote, uuid, { gameId: g.gameId, targetId: uuid === target ? null : target })
        assert.equal(r.ok, true, `${uuid} 낮 표 거절: ${r.code}`)
    }
    const tribunal = w.advanceUntil(node, g.gameId, (s) => s.phase !== 'DAY')
    assert.equal(tribunal.phase, 'TRIBUNAL', '재판으로 안 감')
    for (const uuid of alive.filter((u) => u !== target)) {
        await node.ask(node.b.G.handleCastTribunalVote, uuid, { gameId: g.gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' })
    }
    w.advanceUntil(node, g.gameId, (s) => s.phase !== 'TRIBUNAL')
    await w.settle()
}

// 판 끝까지: 광대를 차례로 처형 (밤은 아무도 안 내고 마감까지) → 시민 이김
async function playToEnd(w, g) {
    for (const [uuid, role] of g.roles) {
        if (role !== 'JOKER') continue
        await voteOut(w, g, uuid)
    }
    assert.equal(g.node.session(g.gameId)?.phase, 'ENDED', '판이 안 끝남')
    await w.settle()
}

// 광대 아닌 사람 하나 (처형·탈주 대상 고를 때)
const citizenOf = (g, skip = []) => [...g.roles].find(([uuid, role]) => role !== 'JOKER' && uuid !== g.host && !skip.includes(uuid))?.[0]
const jokerOf = (g) => [...g.roles].find(([, role]) => role === 'JOKER')?.[0]

// 결과 화면 180초 시계 지금 돌리기 손잡이 대신 가짜 시계로 180초 넘김
const RESULT_SCREEN_MS = 180_000

module.exports = {
    BACKEND, TIMES, BASE_ENV, RESULT_SCREEN_MS,
    loadBundle, startNodes, settle, createDesertionDb,
    openGame, voteOut, playToEnd, citizenOf, jokerOf,
}
