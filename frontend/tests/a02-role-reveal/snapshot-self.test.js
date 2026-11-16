// 스냅샷 → 내 칸·동료 시험: 시작 알림 뒤 get_session_snapshot 답을 스토어에 넣고 내 칸 동료 목록·판 화면 동료 표시 봄 (화면 상태)
// 목록 A02-F-063~095 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"
import {
  ALLY_ROLES, buildGameStarted, buildSelf, buildSnapshot, firstOf, nextGameId, ofRole, seatCode,
} from "./a02Fixtures.mjs"

const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { buildPlayerSessionSourceFromGameState } = await import(
  "../../src/domains/game/ingame/utils/buildPlayerSessionSourceFromGameState.js"
)

test.afterEach(() => useInGameStore.getState().clearGame())

// 로그인 → 시작 알림 → 스냅샷 답 차례로 넣고 스토어 판 값을 꺼냄
function startThenSnapshot(seats, viewer, snapOpts = {}, startOpts = {}) {
  const gameId = snapOpts.gameId ?? nextGameId("snap")
  useAuthStore.getState().login({ uuid: viewer.uuid, nickname: viewer.nickname })
  useInGameStore.getState().setGamePayload(buildGameStarted(seats, viewer, { gameId, ...startOpts }))
  useInGameStore.getState().applySessionSnapshot(buildSnapshot(seats, viewer, { gameId, ...snapOpts }))
  return useInGameStore.getState().state
}

// 판 화면 사람 중 동료 표시 붙은 id
const allyIdsOf = (state) => buildPlayerSessionSourceFromGameState(state).sourcePlayers
  .filter((p) => p.isAlly === true).map((p) => p.id).sort()

// 직업마다 2명 판 (5~6명)
const PAIR_CODES = { JOKER: "J2C3", DOCTOR: "J1D2C3", GUARD: "J1G2C3", WITCH_HUNTER: "J1W2C3" }
const SOLO = seatCode("J1D1G1W1C1", { gameTag: "solo" })
const pairOf = (role, tag) => {
  const seats = seatCode(PAIR_CODES[role], { gameTag: tag })
  const [me, partner] = ofRole(seats, role)
  return { seats, me, partner }
}

// A02-F-063~066 스냅샷 동료 목록 (1일째 낮 스냅샷)
ALLY_ROLES.forEach((role, i) => {
  const no = `A02-F-${String(63 + i).padStart(3, "0")}`
  test(`${no} ${role} 2명 판 스냅샷 self.allies [상대] → 내 칸 동료 [상대]`, () => {
    const { seats, me, partner } = pairOf(role, no)
    const state = startThenSnapshot(seats, me, { phase: "DAY", dayIndex: 1 })
    assert.equal(state.phase, "DAY")
    assert.deepEqual(state.self.allies, [partner.uuid])
  })
})

// A02-F-067~070 스냅샷 직업 1명 → []
ALLY_ROLES.forEach((role, i) => {
  const no = `A02-F-${String(67 + i).padStart(3, "0")}`
  test(`${no} ${role} 1명 판 스냅샷 allies [] → 내 칸 동료 []`, () => {
    const me = firstOf(SOLO, role)
    const state = startThenSnapshot(SOLO, me, { phase: "DAY", dayIndex: 1 })
    assert.equal(state.phase, "DAY")
    assert.deepEqual(state.self.allies, [])
  })
})

test("A02-F-071 시민 스냅샷 → 내 칸에 동료 칸 없음", () => {
  const me = firstOf(SOLO, "CITIZEN")
  const state = startThenSnapshot(SOLO, me, { phase: "DAY", dayIndex: 1 })
  assert.equal(state.phase, "DAY")
  assert.equal(Object.hasOwn(state.self, "allies"), false)
})

test("A02-F-072 [지금 동작] 시민 스냅샷에 self.allies → 스냅샷 버림(판 값 그대로)", () => {
  const seats = seatCode("J1C4", { gameTag: "f072" })
  const [me, other] = ofRole(seats, "CITIZEN")
  const state = startThenSnapshot(seats, me, {
    phase: "DAY", dayIndex: 1, self: buildSelf(seats, me, { allies: [other.uuid] }),
  })
  // 버렸으면 시작 알림 때 값(역할 확인·0일째) 그대로
  assert.equal(state.phase, "ROLE_REVEAL")
  assert.equal(state.dayIndex, 0)
  assert.equal(Object.hasOwn(state.self, "allies"), false)
})

test("A02-F-073 [지금 동작] 의사 self에 allies 칸 없음(옛 서버 값) → 동료 없음 []로 받음", () => {
  const me = firstOf(SOLO, "DOCTOR")
  const { allies, ...oldSelf } = buildSelf(SOLO, me)
  assert.deepEqual(allies, [])
  const state = startThenSnapshot(SOLO, me, { phase: "DAY", dayIndex: 1, self: oldSelf })
  assert.equal(state.phase, "DAY")
  assert.deepEqual(state.self.allies, [])
})

// A02-F-074~077 스냅샷 적용 뒤 판 화면 상대 사람에 동료 표시
ALLY_ROLES.forEach((role, i) => {
  const no = `A02-F-${String(74 + i).padStart(3, "0")}`
  test(`${no} ${role} 2명 판 스냅샷 적용 → 판 화면 상대 사람에 동료 표시`, () => {
    const { seats, me, partner } = pairOf(role, no)
    const state = startThenSnapshot(seats, me, { phase: "DAY", dayIndex: 1 })
    assert.equal(state.phase, "DAY")
    assert.deepEqual(allyIdsOf(state), [partner.uuid])
  })
})

// A02-F-078~086 짝 판 스냅샷 보는 사람마다 → 같은 직업 상대만 동료
const PAIRED_CASES = [
  ...["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN"].map((role) => ({ code: "J2D2G2W2C2", n: 10, role })),
  ...ALLY_ROLES.map((role) => ({ code: "J2D2G2W2", n: 8, role })),
]
PAIRED_CASES.forEach(({ code, n, role }, i) => {
  const no = `A02-F-${String(78 + i).padStart(3, "0")}`
  test(`${no} ${n}명 ${code} 스냅샷, ${role}이 봄 → 같은 직업 상대만 동료`, () => {
    const seats = seatCode(code, { gameTag: no })
    const [me, partner] = ofRole(seats, role)
    const state = startThenSnapshot(seats, me, { phase: "DAY", dayIndex: 1 })
    assert.equal(state.phase, "DAY")
    assert.deepEqual(allyIdsOf(state), role === "CITIZEN" ? [] : [partner.uuid])
  })
})

// A02-F-087~094 판 중 스냅샷(1일째 낮 / 1일째 밤)에도 동료 그대로
const MID_CASES = []
for (const phase of ["DAY", "NIGHT"]) for (const role of ALLY_ROLES) MID_CASES.push({ phase, role })
MID_CASES.forEach(({ phase, role }, i) => {
  const no = `A02-F-${String(87 + i).padStart(3, "0")}`
  const when = phase === "DAY" ? "1일째 낮" : "1일째 밤"
  test(`${no} ${when} 스냅샷, ${role} 2명 판 → 동료 그대로`, () => {
    const { seats, me, partner } = pairOf(role, no)
    const state = startThenSnapshot(seats, me, { phase, dayIndex: 1 })
    assert.equal(state.phase, phase)
    assert.equal(state.dayIndex, 1)
    assert.deepEqual(state.self.allies, [partner.uuid])
    assert.deepEqual(allyIdsOf(state), [partner.uuid])
  })
})

test("A02-F-095 둘째 판 스냅샷: 첫 판 의사 동료 B → 새 판 id(B가 시민) → B 동료 표시 없음", () => {
  // 첫 판: 의사 A·B (6명)
  const first = seatCode("J1D2C3", { gameTag: "f095" })
  const [a, b] = ofRole(first, "DOCTOR")
  const firstState = startThenSnapshot(first, a, { phase: "DAY", dayIndex: 1 })
  assert.deepEqual(allyIdsOf(firstState), [b.uuid])

  // 둘째 판: 같은 사람들, A는 다시 의사(혼자), B는 시민
  const second = first.map((p) => ({ ...p, role: p.uuid === a.uuid ? "DOCTOR" : p.uuid === b.uuid ? "CITIZEN" : p.role }))
  const gameId = nextGameId("snap-2nd")
  useInGameStore.getState().setGamePayload(buildGameStarted(second, a, { gameId }))
  useInGameStore.getState().applySessionSnapshot(buildSnapshot(second, a, { gameId, phase: "DAY", dayIndex: 1 }))
  const state = useInGameStore.getState().state
  assert.equal(state.id, gameId)
  assert.equal(state.phase, "DAY")
  assert.deepEqual(state.self.allies, [])
  assert.deepEqual(allyIdsOf(state), [])
})
