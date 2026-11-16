// 낮 투표 대상 목록(나 빼고 산 사람 전원, 끊긴 사람은 60초 안이면 대상) 화면 상태 시험
// 목록 A03-낮투표.md 번호 A03-F-106~118
import test from "node:test"
import assert from "node:assert/strict"
import { GAME, fakeSocket, fire, renderPanel, resetAll, seat, uuidOf } from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// n명 판 1일 투표 중 조작 값 (나는 0번)
async function targetsPanel({ n = 6, ...seatOptions } = {}) {
  const socket = fakeSocket()
  seat({ n, phase: "DAY", dayPhase: "DAY_VOTE", ...seatOptions })
  const sink = await renderPanel(socket)
  return { socket, sink, ids: () => sink.ctx.dayVoteTargets.map((t) => t.id).sort() }
}
// 번호 목록 → uuid 정렬 (예: [1, 2] → ["p1", "p2"])
const uuids = (list) => list.map(uuidOf).sort()
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
// 사망 알림 (끊김 60초 탈락·나감 모두 이 알림), dead = 지금 죽은 번호 전부
const eliminated = (n, victim, dead) => ({
  gameId: GAME, phase: "DAY", dayIndex: 1, victimUuid: uuidOf(victim),
  players: Array.from({ length: n }, (_, i) => ({ uuid: uuidOf(i), alive: !dead.includes(i) })),
})

// A03-F-106~111 인원 5~10 → 나 빼고 산 사람 전원
;[5, 6, 7, 8, 9, 10].forEach((n, i) => {
  test(`A03-F-${106 + i} ${n}명 판 → 대상 = 나 빼고 ${n - 1}명 전원`, async () => {
    const { ids } = await targetsPanel({ n })
    assert.deepEqual(ids(), uuids(range(1, n - 1)))
  })
})

test("A03-F-112 ⑦ 7명 판 1명 죽음 → 죽은 사람 빠짐", async () => {
  const { ids } = await targetsPanel({ n: 7, dead: [4] })
  assert.deepEqual(ids(), uuids([1, 2, 3, 5, 6]))
})

test("A03-F-113 ⑧ 9명 판 3명 죽음 → 죽은 사람 빠짐", async () => {
  const { ids } = await targetsPanel({ n: 9, dead: [2, 5, 8] })
  assert.deepEqual(ids(), uuids([1, 3, 4, 6, 7]))
})

test("A03-F-114 ⑨ 끊긴 사람(60초 안) → 대상에 있음", async () => {
  const { socket, ids } = await targetsPanel({ n: 6 })
  await fire(socket, "session_player_connection_changed", { gameId: GAME, uuid: uuidOf(3), isConnected: false })
  assert.deepEqual(ids(), uuids([1, 2, 3, 4, 5]))
})

test("A03-F-115 ⑩ 끊겨 60초 지나 탈락한 사람 → 빠짐", async () => {
  const { socket, ids } = await targetsPanel({ n: 6 })
  await fire(socket, "session_player_connection_changed", { gameId: GAME, uuid: uuidOf(3), isConnected: false })
  await fire(socket, "player_eliminated", eliminated(6, 3, [3]))
  assert.deepEqual(ids(), uuids([1, 2, 4, 5]))
})

test("A03-F-116 ⑪ 판에서 나간 사람 → 빠짐", async () => {
  const { socket, ids } = await targetsPanel({ n: 6 })
  await fire(socket, "player_eliminated", eliminated(6, 2, [2]))
  await fire(socket, "session_participation_changed", {
    gameId: GAME, phase: "DAY", dayIndex: 1, hostUuid: uuidOf(0), participationRevision: 1, departedUuid: uuidOf(2),
    players: Array.from({ length: 6 }, (_, i) => ({ uuid: uuidOf(i), membershipId: null, alive: i !== 2, isParticipating: i !== 2 })),
  })
  assert.deepEqual(ids(), uuids([1, 3, 4, 5]))
})

test("A03-F-117 ⑫ 나는 광대, 동료 광대 → 대상에 있음", async () => {
  const { ids } = await targetsPanel({ n: 8, role: "JOKER", allies: [3] })
  assert.ok(ids().includes(uuidOf(3)))
  assert.deepEqual(ids(), uuids(range(1, 7)))
})

test("A03-F-118 ⑬ 죽고 끊긴 사람 → 빠짐", async () => {
  const { ids } = await targetsPanel({ n: 6, dead: [2], disconnected: [2] })
  assert.deepEqual(ids(), uuids([1, 3, 4, 5]))
})
