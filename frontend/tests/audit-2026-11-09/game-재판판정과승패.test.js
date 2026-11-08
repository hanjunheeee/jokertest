// 6차 묶음: 재판 판정 반영(유죄·무죄·취소·판 끝)과 공개 승패 결과 다듬기
import test from "node:test"
import assert from "node:assert/strict"

import { applyTribunalResolvedPure } from "../../src/domains/game/ingame/store/applyTribunalResolved.js"
import { normalizePublicWinResult } from "../../src/domains/game/ingame/utils/normalizePublicWinResult.js"

const players = () => [
  { uuid: "a", alive: true },
  { uuid: "b", alive: true },
  { uuid: "c", alive: true },
]
const current = (extra = {}) => ({
  gameId: "g",
  state: { phase: "TRIBUNAL", dayIndex: 2, tribunal: { defendantUuid: "b" }, players: players(), ...extra },
})
const payload = (extra = {}) => ({
  gameId: "g",
  dayIndex: 2,
  phase: "NIGHT",
  defendantUuid: "b",
  outcome: "GUILTY",
  executedUuid: "b",
  counts: { guilty: 3, notGuilty: 1 },
  ...extra,
})

test("재판 판정: 유죄·밤으로면 피고만 죽고 재판 상태가 지워짐", () => {
  const next = applyTribunalResolvedPure(current(), payload())
  assert.equal(next.state.phase, "NIGHT")
  assert.equal(next.state.tribunal, null)
  assert.deepEqual(next.state.players.map((p) => p.alive), [true, false, true])
})

test("재판 판정: 무죄·밤으로면 아무도 안 죽음", () => {
  const cur = current()
  const next = applyTribunalResolvedPure(cur, payload({ outcome: "NOT_GUILTY", executedUuid: null }))
  assert.equal(next.state.phase, "NIGHT")
  assert.equal(next.state.players, cur.state.players)
})

test("재판 판정: 유죄인데 처형된 사람이 피고가 아니면 그대로", () => {
  const cur = current()
  assert.equal(applyTribunalResolvedPure(cur, payload({ executedUuid: "a" })), cur)
})

test("재판 판정: 무죄인데 처형된 사람이 있으면 그대로", () => {
  const cur = current()
  assert.equal(applyTribunalResolvedPure(cur, payload({ outcome: "NOT_GUILTY", executedUuid: "b" })), cur)
})

test("재판 판정: 다른 판·다른 날·다른 피고 방송은 무시", () => {
  const cur = current()
  assert.equal(applyTribunalResolvedPure(cur, payload({ gameId: "h" })), cur)
  assert.equal(applyTribunalResolvedPure(cur, payload({ dayIndex: 3 })), cur)
  assert.equal(applyTribunalResolvedPure(cur, payload({ defendantUuid: "c", executedUuid: "c" })), cur)
})

test("재판 판정: 표 수가 음수거나 빠지면 무시", () => {
  const cur = current()
  assert.equal(applyTribunalResolvedPure(cur, payload({ counts: { guilty: -1, notGuilty: 0 } })), cur)
  assert.equal(applyTribunalResolvedPure(cur, payload({ counts: null })), cur)
})

test("재판 판정: 이미 밤인데 밤으로 가는 방송은 무시(두 번 받기)", () => {
  const cur = current({ phase: "NIGHT" })
  assert.equal(applyTribunalResolvedPure(cur, payload()), cur)
})

test("재판 취소(피고 나감): 밤으로·처형 없음, 피고는 죽은 것으로 둠(FE-002 놓친 사망 방송 보완)", () => {
  const next = applyTribunalResolvedPure(
    current(),
    payload({ outcome: "CANCELLED", reason: "DEFENDANT_LEFT", executedUuid: null, counts: { guilty: 0, notGuilty: 0 } }),
  )
  assert.equal(next.state.phase, "NIGHT")
  assert.equal(next.state.tribunal, null)
  assert.equal(next.state.players.find((p) => p.uuid === "b").alive, false)
})

test("재판 취소: 이미 죽은 피고 줄은 같은 객체로 둠", () => {
  const cur = current({ players: [{ uuid: "a", alive: true }, { uuid: "b", alive: false }] })
  const next = applyTribunalResolvedPure(
    cur,
    payload({ outcome: "CANCELLED", reason: "DEFENDANT_LEFT", executedUuid: null }),
  )
  assert.equal(next.state.players[1], cur.state.players[1])
})

test("재판 취소: 모르는 이유·처형자 있음·밤 아닌 단계면 무시", () => {
  const cur = current()
  const c = { outcome: "CANCELLED", reason: "DEFENDANT_LEFT", executedUuid: null }
  assert.equal(applyTribunalResolvedPure(cur, payload({ ...c, reason: "TIMEOUT" })), cur)
  assert.equal(applyTribunalResolvedPure(cur, payload({ ...c, executedUuid: "b" })), cur)
  assert.equal(applyTribunalResolvedPure(cur, payload({ ...c, phase: "DAY" })), cur)
})

test("재판 판정 판 끝: 명단 생존을 방송 값으로 덮고 승패 결과를 남김", () => {
  const next = applyTribunalResolvedPure(
    current(),
    payload({
      phase: "ENDED",
      players: [{ uuid: "a", isAlive: true }, { uuid: "b", isAlive: false }, { uuid: "c", isAlive: false }],
      winResult: { winner: "CITIZEN" },
    }),
  )
  assert.equal(next.state.phase, "ENDED")
  assert.deepEqual(next.state.players.map((p) => p.alive), [true, false, false])
  assert.deepEqual(next.state.winResult, { winner: "CITIZEN" })
  assert.equal(next.state.tribunal.resolved, true)
  assert.equal(next.state.tribunal.executedUuid, "b")
})

test("재판 판정 판 끝: 승패 결과가 없거나 모르는 이긴 쪽이면 무시", () => {
  const cur = current()
  const ended = { phase: "ENDED", players: [{ uuid: "a", isAlive: true }, { uuid: "b", isAlive: false }, { uuid: "c", isAlive: true }] }
  assert.equal(applyTribunalResolvedPure(cur, payload({ ...ended, winResult: null })), cur)
  assert.equal(applyTribunalResolvedPure(cur, payload({ ...ended, winResult: { winner: "DRAW" } })), cur)
})

test("재판 판정 판 끝: 명단이 지금 명단과 다르거나 같은 사람이 두 번이면 무시", () => {
  const cur = current()
  const w = { phase: "ENDED", winResult: { winner: "JOKER" } }
  assert.equal(applyTribunalResolvedPure(cur, payload({ ...w, players: [{ uuid: "a", isAlive: true }, { uuid: "b", isAlive: false }] })), cur)
  assert.equal(
    applyTribunalResolvedPure(cur, payload({ ...w, players: [{ uuid: "a", isAlive: true }, { uuid: "a", isAlive: true }, { uuid: "b", isAlive: false }] })),
    cur,
  )
  assert.equal(
    applyTribunalResolvedPure(cur, payload({ ...w, players: [{ uuid: "a", isAlive: true }, { uuid: "b", isAlive: false }, { uuid: "z", isAlive: true }] })),
    cur,
  )
})

test("재판 판정: 틀린 모양(피고 없음·날짜 글자) 방송은 무시", () => {
  const cur = current()
  assert.equal(applyTribunalResolvedPure(cur, payload({ defendantUuid: "" })), cur)
  assert.equal(applyTribunalResolvedPure(cur, payload({ dayIndex: "2" })), cur)
  assert.equal(applyTribunalResolvedPure(cur, null), cur)
})

test("승패 결과: 모르는 이긴 쪽이나 틀린 모양은 null", () => {
  assert.equal(normalizePublicWinResult({ winner: "NOBODY" }), null)
  assert.equal(normalizePublicWinResult([]), null)
  assert.equal(normalizePublicWinResult(null), null)
})

test("승패 결과: 공개 목록이 비면 reveals 칸을 안 붙임", () => {
  assert.deepEqual(normalizePublicWinResult({ winner: "JOKER", reveals: [] }), { winner: "JOKER" })
})

test("승패 결과: 공개 목록에서 같은 사람 두 번째·모양 틀린 항목만 뺌", () => {
  const r = normalizePublicWinResult({
    winner: "CITIZEN",
    reveals: [
      { uuid: "a", nickname: "가", role: "DOCTOR", team: "CITIZEN", alive: true, deathReason: null },
      { uuid: "a", nickname: "가2", role: "DOCTOR", team: "CITIZEN", alive: true },
      { uuid: "b", nickname: "나", role: "JOKER", team: "MAFIA", alive: false },
      { uuid: "c", nickname: "다", role: "JOKER", team: "JOKER", alive: "no" },
      { uuid: "d", nickname: "라", role: "JOKER", team: "JOKER", alive: false, deathReason: "EXECUTED" },
    ],
  })
  assert.deepEqual(r.reveals.map((x) => x.uuid), ["a", "d"])
  assert.equal(r.reveals[1].deathReason, "EXECUTED")
})

test("승패 결과: 살아 있는 사람의 죽은 이유는 비움", () => {
  const r = normalizePublicWinResult({
    winner: "JOKER",
    reveals: [{ uuid: "a", nickname: "가", role: "GUARD", team: "CITIZEN", alive: true, deathReason: "KILLED" }],
  })
  assert.equal(r.reveals[0].deathReason, null)
})

test("승패 결과: MVP는 uuid만 남기고, 틀리면 뺌", () => {
  assert.deepEqual(normalizePublicWinResult({ winner: "JOKER", mvp: { uuid: "a", score: 9 } }).mvp, { uuid: "a" })
  assert.equal(Object.hasOwn(normalizePublicWinResult({ winner: "JOKER", mvp: { uuid: "" } }), "mvp"), false)
})
