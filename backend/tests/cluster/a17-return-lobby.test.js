'use strict'

// 서버 2대(메모리 Redis)에서 판 끝 "대기방으로"·로비 입장 정리 시험 — 다른 Node 출신 돌아오기·로비 거쳐 다시 들어오기·산 사람/죽은 사람·버그 4·방장 자리
// 목록 A17-B-039~044 (docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md "대기방으로 · 로비 입장 정리 서버 2대")
const test = require('node:test')
const assert = require('node:assert/strict')

const W = require('./a17-world')

// Node마다 따로 불러 둔 backend 묶음
const B = { n1: W.loadBundle(), n2: W.loadBundle() }

// 두 Node + 가짜 시계 켠 세상
async function world(t) {
    const w = await W.startNodes(t, B)
    w.useFakeClock()
    return w
}

// 다른 Node에서 보는 사람 위치 키 값
const locOf = (w, uuid) => w.n2.readKey(w.n2.dirKeys().loc(uuid))

// 판 스냅샷 요청 답 (화면이 새로고침 때 하는 것)
const snapshot = (node, uuid, gameId) => node.ask(node.b.G.handleGetSessionSnapshot, uuid, { gameId })

test('A17-B-039 결과 화면 사람의 "대기방으로"는 판 Node에서 바로 됨 (5명 판, 다른 Node 출신 2명)', async (t) => {
    const w = await world(t)
    const movers = ['b039-3', 'b039-4']
    const g = await W.openGame(w, w.n1, { prefix: 'b039', n: 5, movers: { from: w.n2, uuids: movers } })
    await W.playToEnd(w, g)
    let room = null
    for (const uuid of movers) {
        const r = await w.n1.returnToRoom(uuid, g.gameId)
        assert.equal(r.ok, true, `${uuid} ${r.code} ${r.message}`)
        // 다시 옮기라는 답이 아님
        assert.equal(r.code, undefined)
        assert.equal(r.node, undefined)
        room = r.room
    }
    assert.equal(room.roomCode, g.roomCode)
    const names = room.players.map((p) => p.uuid)
    for (const uuid of movers) assert.ok(names.includes(uuid), `${uuid} 명단에 없음`)
})

test('A17-B-040 로비로 간 사람이 다른 Node 로비에서 코드로 다시 들어옴 (6명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b040', n: 6 })
    await W.playToEnd(w, g)
    const who = g.uuids[2]
    const lobby = await w.n1.enterLobby(who)
    assert.equal(lobby.ok, true)
    await w.settle()
    assert.equal(await locOf(w, who), null, '위치 기록이 안 지워짐')
    // n2로 접속 → 받음 (돌려보내지 않음)
    assert.equal(await w.n2.route(who), null)
    w.n1.drop(who)
    w.n2.connect(who)
    const first = await w.n2.joinByCode(who, g.roomCode)
    assert.equal(first?.payload?.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(first?.payload?.node, 'n1')
    w.n2.drop(who)
    w.n1.connect(who)
    const final = await w.n1.joinByCode(who, g.roomCode)
    assert.equal(final?.event, 'room_joined', JSON.stringify(final?.payload))
    assert.ok(final.payload.players.some((p) => p.uuid === who))
})

test('A17-B-041 판 중 산 사람은 다른 Node 로비로 못 빠짐 (7명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b041', n: 7 })
    w.advanceUntil(w.n1, g.gameId, (s) => s.phase === 'DAY')
    const who = W.citizenOf(g)
    const routed = await w.n2.route(who)
    assert.equal(routed?.message, 'WRONG_NODE')
    assert.deepEqual(routed.data, { node: 'n1' })
    const lobby = await w.n1.enterLobby(who)
    assert.deepEqual({ ok: lobby.ok, redirect: lobby.redirect, gameId: lobby.gameId }, { ok: true, redirect: 'INGAME', gameId: g.gameId })
    // 판에서 안 빠짐: 판 스냅샷을 그대로 받고, 다시 불러도 판으로 보냄
    const snap = await snapshot(w.n1, who, g.gameId)
    assert.equal(snap.ok, true, JSON.stringify(snap))
    const again = await w.n1.enterLobby(who)
    assert.equal(again.redirect, 'INGAME')
})

test('A17-B-042 판 중 죽은 사람은 로비 입장으로 풀려 다른 Node에서 방 만들기 됨 (8명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b042', n: 8 })
    const dead = W.citizenOf(g)
    await W.voteOut(w, g, dead)
    assert.notEqual(g.node.session(g.gameId)?.phase, 'ENDED', '판이 끝나 버림 (판 도중이 아님)')
    const lobby = await w.n1.enterLobby(dead)
    assert.equal(lobby.ok, true)
    assert.equal(lobby.redirect, null)
    await w.settle()
    assert.equal(await w.n2.route(dead), null, 'n2 접속이 판 Node로 돌려보내짐')
    w.n1.drop(dead)
    w.n2.connect(dead)
    const made = await w.n2.createRoom(dead)
    assert.equal(made.ok, true, `${made.code} ${made.message}`)
})

test('A17-B-043 [버그 4] 방 만든 채 다른 Node로 새 탭 → 옛 방 사라짐', async (t) => {
    const w = await world(t)
    const who = 'b043-host'
    w.n1.connect(who)
    const made = await w.n1.createRoom(who)
    assert.equal(made.ok, true, made.message)
    await w.settle()
    const oldId = made.room.roomId
    const oldCode = made.room.roomCode
    // 새 탭이 n2를 찍고 와도 위치 기록 때문에 n1로 감
    const routed = await w.n2.route(who, { node: 'n2' })
    assert.equal(routed?.message, 'WRONG_NODE')
    assert.deepEqual(routed.data, { node: 'n1' })
    // n1 새 탭이 로비 입장
    w.n1.connect(who)
    const lobby = await w.n1.enterLobby(who)
    assert.equal(lobby.ok, true)
    await w.settle()
    assert.equal(await w.n2.readKey(w.n2.dirKeys().room(oldId)), null, '옛 방이 남음')
    assert.equal(await w.n2.readKey(w.n2.dirKeys().roomcode(oldCode)), null, '옛 방 코드가 남음')
    const again = await w.n1.createRoom(who)
    assert.equal(again.ok, true, again.message)
    assert.notEqual(again.room.roomId, oldId)
})

test('A17-B-044 원래 방장이 다른 Node 로비로 가면 남겨 둔 방장 자리 끝 (6명 판)', async (t) => {
    const w = await world(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b044', n: 6 })
    await W.playToEnd(w, g)
    const [first, second] = g.uuids.filter((u) => u !== g.host)
    for (const uuid of [first, second]) {
        const r = await w.n1.returnToRoom(uuid, g.gameId)
        assert.equal(r.ok, true, `${uuid} ${r.code} ${r.message}`)
    }
    const lobby = await w.n1.enterLobby(g.host)
    assert.equal(lobby.ok, true)
    await w.settle()
    for (const uuid of [first, second]) {
        const changed = w.n1.received(uuid, 'host_changed').at(-1)
        assert.ok(changed, `${uuid} host_changed 못 받음`)
        assert.equal(changed.hostUuid, first)
        assert.equal(changed.reservedHostUuid, null)
    }
})
