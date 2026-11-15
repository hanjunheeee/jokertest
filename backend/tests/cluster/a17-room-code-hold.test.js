'use strict'

// 서버 2대(메모리 Redis)에서 판 동안 방 코드 잡기·판 끝 같은 코드 방·180초 뒤 코드 풀림·점검·비우는 중·판 Node 죽음 시험
// 목록 A17-B-026~038 (docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md "판 동안 방 코드 잡기 · 판 끝 같은 코드")
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const W = require('./a17-world')

// Node마다 따로 불러 둔 backend 묶음 (n1에는 점검 판 끝내기도)
const B = {
    n1: W.loadBundle({ extra: ['socket/gameSession/departure/maintenanceAbort'] }),
    n2: W.loadBundle(),
}

// 방 코드 글자 (utils/roomCode.js와 같은 순서) → 뽑기 바이트를 이 순서 번호로 주면 그 글자가 나옴
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
// 아무도 안 쓰는 코드 ("방 없음" 답을 견줄 때)
const UNUSED_CODE = 'ZZZZZZ'

// 그 Node에서 코드 뽑기를 code만 나오게 고정하고 방 만들기 (만드는 동안만 고정)
async function createWithCode(t, node, uuid, code, overrides = {}) {
    const bytes = [...code].map((c) => CHARS.indexOf(c))
    const fixed = t.mock.method(crypto, 'randomBytes', (n) => Buffer.from(bytes.slice(0, n)))
    try {
        return await node.createRoom(uuid, overrides)
    } finally {
        fixed.mock.restore()
    }
}

// from Node에서 코드 입장 → 옮기라는 답이면 to Node로 옮겨 다시 보냄 → { first, final }
async function moveJoin(from, to, uuid, code) {
    from.connect(uuid)
    const first = await from.joinByCode(uuid, code)
    from.drop(uuid)
    to.connect(uuid)
    const final = await to.joinByCode(uuid, code)
    return { first, final }
}

// 두 Node + 가짜 시계 켠 세상
async function world(t) {
    const w = await W.startNodes(t, B)
    w.useFakeClock()
    return w
}

// 디렉터리 키 값 (n2 쪽에서 봄 = 다른 Node가 보는 값)
const codeKey = (w, code) => w.n2.readKey(w.n2.dirKeys().roomcode(code))
const roomKey = (w, roomId) => w.n2.readKey(w.n2.dirKeys().room(roomId))

// 그 Node 대기방 장부에서 그 코드 방들
const roomsWithCode = (node, code) => node.b.mm.__getStateSnapshotForTests().gameRooms
    .map(([, room]) => room).filter((room) => room.code === code)

test('A17-B-026 판 동안 다른 Node가 같은 코드를 못 잡음 (5명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b026', n: 5 })
    w.n2.connect('b026-other')
    const made = await createWithCode(t, w.n2, 'b026-other', g.roomCode)
    await w.settle()
    // 다른 코드로 만들었거나 코드 못 뽑음 거절이면 맞음
    if (made.ok) assert.notEqual(made.room.roomCode, g.roomCode)
    const held = await codeKey(w, g.roomCode)
    assert.equal(held, g.roomId, 'roomcode 키가 판 전 n1 방 그대로가 아님')
    assert.equal((await roomKey(w, held))?.node, 'n1')
})

test('A17-B-027 판 중 다른 Node 사람이 그 코드로 오면 "이미 시작" (6명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b027', n: 6 })
    const { first, final } = await moveJoin(w.n2, w.n1, 'b027-late', g.roomCode)
    assert.equal(first?.payload?.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(first?.payload?.node, 'n1')
    assert.equal(final?.event, 'room_join_failed')
    assert.equal(final.payload.code, 'ROOM_ALREADY_STARTED')
    assert.equal(final.payload.message, '이미 게임이 시작된 방입니다.')
})

test('A17-B-028 판 끝 → 같은 코드 방이 판이 있던 Node에 생김 (7명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b028', n: 7 })
    await W.playToEnd(w, g)
    await w.settle()
    const rooms = roomsWithCode(w.n1, g.roomCode)
    assert.equal(rooms.length, 1, 'n1 장부에 코드 C 방이 하나가 아님')
    const newId = rooms[0].id
    assert.notEqual(newId, g.roomId)
    assert.equal(await codeKey(w, g.roomCode), newId)
    assert.equal((await roomKey(w, newId))?.node, 'n1')
})

test('A17-B-029 판 끝 뒤 다른 Node 사람이 코드로 오면 옮겨 들어감 (8명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b029', n: 8 })
    await W.playToEnd(w, g)
    const { first, final } = await moveJoin(w.n2, w.n1, 'b029-late', g.roomCode)
    assert.equal(first?.payload?.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(first?.payload?.node, 'n1')
    assert.equal(final?.event, 'room_joined', JSON.stringify(final?.payload))
    const me = final.payload.players.find((p) => p.uuid === 'b029-late')
    assert.ok(me, '명단에 없음')
    assert.equal(me.isReady, false)
})

test('A17-B-030 판 끝 뒤 0명 공개 방은 다른 Node 목록에도 안 보임 (5명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b030', n: 5, accessType: 'open' })
    await W.playToEnd(w, g)
    // 목록 묶음(0.5초)·스냅샷 버스가 지나게
    w.tick(1_000)
    await w.settle()
    const newId = roomsWithCode(w.n1, g.roomCode)[0]?.id
    assert.ok(newId, '판 끝 방이 안 열림')
    w.n2.connect('b030-viewer')
    const before = await w.n2.publicRooms()
    assert.equal(before.rooms.some((r) => r.id === newId), false, '0명 방이 n2 목록에 보임')
    const back = await w.n1.returnToRoom(g.uuids[1], g.gameId)
    assert.equal(back.ok, true, `${back.code} ${back.message}`)
    w.tick(1_000)
    await w.settle()
    const after = await w.n2.publicRooms()
    assert.equal(after.rooms.some((r) => r.id === newId && r.node === 'n1'), true, '한 명 들어온 뒤에도 n2 목록에 안 보임')
})

test('A17-B-031 180초 동안 아무도 안 오면 코드가 풀림 (6명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b031', n: 6 })
    await W.playToEnd(w, g)
    w.tick(W.RESULT_SCREEN_MS)
    await w.settle()
    w.n2.connect('b031-late')
    const answer = await w.n2.joinByCode('b031-late', g.roomCode)
    // "방 없음" = 아무도 안 쓴 코드를 쳤을 때와 같은 답
    w.n2.connect('b031-unused')
    const unused = await w.n2.joinByCode('b031-unused', UNUSED_CODE)
    assert.equal(answer?.event, 'room_join_failed')
    assert.deepEqual(
        { code: answer.payload.code, message: answer.payload.message },
        { code: unused.payload.code, message: unused.payload.message },
    )
    assert.equal(await codeKey(w, g.roomCode), null)
})

test('A17-B-032 풀린 코드는 다른 Node가 다시 잡을 수 있음 (10명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b032', n: 10 })
    await W.playToEnd(w, g)
    w.tick(W.RESULT_SCREEN_MS)
    await w.settle()
    w.n2.connect('b032-new')
    const made = await createWithCode(t, w.n2, 'b032-new', g.roomCode)
    assert.equal(made.ok, true, made.message)
    assert.equal(made.room.roomCode, g.roomCode)
})

test('A17-B-033 한 명이라도 있으면 180초 뒤에도 코드 유지 (7명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b033', n: 7 })
    await W.playToEnd(w, g)
    const back = await w.n1.returnToRoom(g.uuids[2], g.gameId)
    assert.equal(back.ok, true, `${back.code} ${back.message}`)
    w.tick(W.RESULT_SCREEN_MS)
    await w.settle()
    w.n2.connect('b033-new')
    const made = await createWithCode(t, w.n2, 'b033-new', g.roomCode)
    if (made.ok) assert.notEqual(made.room.roomCode, g.roomCode, 'n2가 아직 쓰는 코드를 잡음')
    const { first, final } = await moveJoin(w.n2, w.n1, 'b033-late', g.roomCode)
    assert.equal(first?.payload?.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(first?.payload?.node, 'n1')
    assert.equal(final?.event, 'room_joined', JSON.stringify(final?.payload))
})

test('A17-B-034 판이 방을 다시 안 열고 끝나면 코드를 놓음 (5명 판, 점검 강제 종료)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b034', n: 5 })
    // 첫 낮까지 가 둠 (판 도중 점검처럼)
    w.advanceUntil(w.n1, g.gameId, (s) => s.phase === 'DAY')
    const aborted = w.n1.b.x['socket/gameSession/departure/maintenanceAbort'].abortGamesForMaintenance(w.n1.io)
    assert.equal(aborted, 1)
    await w.settle()
    assert.equal(await codeKey(w, g.roomCode), null, 'roomcode 키가 안 놓임')
    w.n2.connect('b034-new')
    const made = await createWithCode(t, w.n2, 'b034-new', g.roomCode)
    const started = await w.n2.readKey(w.n2.dirKeys().startedcode(g.roomCode))
    assert.equal(made.ok, true, `${made.message} (startedcode 키: ${JSON.stringify(started)})`)
    assert.equal(made.room.roomCode, g.roomCode)
})

test('A17-B-035 비우는 중 Node의 판 끝 → 방 안 엶, "대기방으로" 거절 (6명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b035', n: 6 })
    w.n1.cluster.nodes.setDraining(true)
    await W.playToEnd(w, g)
    await w.settle()
    assert.equal(roomsWithCode(w.n1, g.roomCode).length, 0, 'n1에 코드 C 방이 열림')
    const back = await w.n1.returnToRoom(g.uuids[1], g.gameId)
    assert.deepEqual(
        { ok: back.ok, code: back.code, message: back.message },
        { ok: false, code: 'NODE_DRAINING', message: '서버 점검 준비 중이라 대기방으로 돌아갈 수 없습니다.' },
    )
    assert.equal(await codeKey(w, g.roomCode), null, 'roomcode 키가 안 놓임')
})

test('A17-B-036 비우는 중이어도 결과 화면 "로비로"는 됨 (6명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b036', n: 6 })
    w.n1.cluster.nodes.setDraining(true)
    await W.playToEnd(w, g)
    const who = g.uuids[1]
    const lobby = await w.n1.enterLobby(who)
    assert.equal(lobby.ok, true)
    assert.equal(lobby.redirect, null)
    // 끝난 판에서 빠졌으면 방 만들기가 "판 중" 거절이 아니라 n2로 보내짐
    const here = await w.n1.createRoom(who)
    assert.equal(here.ok, false)
    assert.equal(here.code, 'ROOM_ON_OTHER_NODE', JSON.stringify(here))
    assert.equal(here.node, 'n2')
    w.n1.drop(who)
    w.n2.connect(who)
    const there = await w.n2.createRoom(who)
    assert.equal(there.ok, true, there.message)
})

test('A17-B-037 판 끝 뒤 "시작된 방" 표시가 지워져 다른 Node도 "이미 시작"이라 안 함 (8명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b037', n: 8 })
    await W.playToEnd(w, g)
    const { first, final } = await moveJoin(w.n2, w.n1, 'b037-late', g.roomCode)
    assert.notEqual(first?.payload?.code, 'ROOM_ALREADY_STARTED')
    assert.notEqual(final?.payload?.code, 'ROOM_ALREADY_STARTED')
    assert.equal(final?.event, 'room_joined', JSON.stringify(final?.payload))
})

test('A17-B-038 판 Node가 판 중 죽으면 다른 Node는 "이미 끝난 게임" (5명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b038', n: 5 })
    await w.kill('n1')
    w.n2.connect('b038-late')
    const answer = await w.n2.joinByCode('b038-late', g.roomCode)
    assert.equal(answer?.event, 'room_join_failed')
    assert.equal(answer.payload.code, 'SESSION_ENDED')
    assert.equal(answer.payload.message, '이미 끝난 게임의 방입니다.')
})
