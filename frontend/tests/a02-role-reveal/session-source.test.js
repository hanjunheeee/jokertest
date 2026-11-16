// 시작 알림 → 판 화면 사람 시험: game_started 값을 스토어에 넣고 판 화면 사람 목록의 동료 표시·직업 칸 봄 (화면 상태)
// 목록 A02-F-023~062 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"
import {
  ALLY_ROLES, autoCounts, buildGameStarted, buildSelf, firstOf, nextGameId, ofRole, seatCode, seatPlayers,
} from "./a02Fixtures.mjs"

const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { buildPlayerSessionSourceFromGameState } = await import(
  "../../src/domains/game/ingame/utils/buildPlayerSessionSourceFromGameState.js"
)

test.afterEach(() => useInGameStore.getState().clearGame())

// 보는 사람으로 로그인하고 시작 알림을 스토어에 넣은 뒤 판 화면 사람 목록을 꺼냄
function startAs(seats, viewer, opts = {}) {
  useAuthStore.getState().login({ uuid: viewer.uuid, nickname: viewer.nickname })
  const payload = buildGameStarted(seats, viewer, { gameId: nextGameId("src"), ...opts })
  useInGameStore.getState().setGamePayload(payload)
  return buildPlayerSessionSourceFromGameState(useInGameStore.getState().state)
}

// 동료 표시가 붙은 사람 id만 → ["g-p3"]
const allyIds = (built) => built.sourcePlayers.filter((p) => p.isAlly === true).map((p) => p.id).sort()
// 직업 칸이 있는 사람 id만
const roleIds = (built) => built.sourcePlayers.filter((p) => Object.hasOwn(p, "role")).map((p) => p.id)

// A02-F-023~026 같은 직업 2명 판: 상대 사람만 동료 표시
const PAIR_CASES = [
  ["A02-F-023", "JOKER", "광대 2(5명)", "J2C3"],
  ["A02-F-024", "DOCTOR", "의사 2(7명)", "J1D2C4"],
  ["A02-F-025", "GUARD", "경비원 2(8명)", "J1D1G2C4"],
  ["A02-F-026", "WITCH_HUNTER", "마녀사냥꾼 2(10명)", "J1D1G1W2C5"],
]
for (const [no, role, label, code] of PAIR_CASES) {
  test(`${no} ${label} game_started → 상대 사람만 동료 표시, 나머지 없음`, () => {
    const seats = seatCode(code, { gameTag: no })
    const [me, partner] = ofRole(seats, role)
    const built = startAs(seats, me)
    assert.equal(built.localPlayerId, me.uuid)
    assert.deepEqual(allyIds(built), [partner.uuid])
  })
}

test("A02-F-027 시민 6명 판(10명 자동)의 시민 → 아무도 동료 표시 없음", () => {
  const seats = seatPlayers(autoCounts(10), { gameTag: "f027" })
  assert.equal(ofRole(seats, "CITIZEN").length, 6)
  const built = startAs(seats, firstOf(seats, "CITIZEN"))
  assert.equal(built.sourcePlayers.length, 10)
  assert.deepEqual(allyIds(built), [])
})

test("A02-F-028 [지금 동작] 시민 self에 allies가 실려 옴 → 판 화면 사람 목록 버림(빈 결과)", () => {
  const seats = seatCode("J1C4", { gameTag: "f028" })
  const [me, other] = ofRole(seats, "CITIZEN")
  const built = startAs(seats, me, { self: buildSelf(seats, me, { allies: [other.uuid] }) })
  assert.equal(built.sourcePlayers, null)
  assert.equal(built.localPlayerId, null)
})

test("A02-F-029 6명 → 내 칸에만 직업·팀, 남의 칸엔 직업 없음", () => {
  const seats = seatPlayers(autoCounts(6), { gameTag: "f029" })
  const me = firstOf(seats, "DOCTOR")
  const built = startAs(seats, me)
  assert.deepEqual(roleIds(built), [me.uuid])
  const mine = built.sourcePlayers.find((p) => p.id === me.uuid)
  assert.equal(mine.role, "DOCTOR")
  assert.equal(mine.team, "CITIZEN")
  for (const other of built.sourcePlayers.filter((p) => p.id !== me.uuid)) {
    assert.equal(Object.hasOwn(other, "team"), false, other.id)
  }
})

test("A02-F-030 의사 2(6명) → 상대 칸에 동료 표시, 직업 칸은 없음", () => {
  const seats = seatCode("J1D2C3", { gameTag: "f030" })
  const [me, partner] = ofRole(seats, "DOCTOR")
  const built = startAs(seats, me)
  const row = built.sourcePlayers.find((p) => p.id === partner.uuid)
  assert.equal(row.isAlly, true)
  assert.equal(Object.hasOwn(row, "role"), false)
  assert.equal(Object.hasOwn(row, "team"), false)
})

// A02-F-031~051 자동 구성 판(광대 1) × 그 판에 있는 직업마다 보는 사람 → 동료 표시 없음, 내 칸만 직업
const AUTO_CASES = []
for (let n = 5; n <= 10; n += 1) {
  for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN"]) {
    if (autoCounts(n)[role]) AUTO_CASES.push({ n, role })
  }
}
AUTO_CASES.forEach(({ n, role }, i) => {
  const no = `A02-F-${String(31 + i).padStart(3, "0")}`
  test(`${no} 자동 ${n}명 판, ${role}이 봄 → 아무도 동료 표시 없음, 내 칸만 직업`, () => {
    const seats = seatPlayers(autoCounts(n), { gameTag: no })
    const me = firstOf(seats, role)
    const built = startAs(seats, me)
    assert.deepEqual(allyIds(built), [])
    assert.deepEqual(roleIds(built), [me.uuid])
    assert.equal(built.sourcePlayers.find((p) => p.id === me.uuid).role, role)
  })
})

// A02-F-052~060 짝 판 보는 사람마다 → 같은 직업 상대만 동료 표시 (시민은 없음)
const PAIRED_CASES = [
  ...["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN"].map((role) => ({ code: "J2D2G2W2C2", n: 10, role })),
  ...ALLY_ROLES.map((role) => ({ code: "J2D2G2W2", n: 8, role })),
]
PAIRED_CASES.forEach(({ code, n, role }, i) => {
  const no = `A02-F-${String(52 + i).padStart(3, "0")}`
  const expectText = role === "CITIZEN" ? "동료 표시 없음" : "같은 직업 상대만 동료 표시"
  test(`${no} ${n}명 ${code} ${role}이 봄 → ${expectText}`, () => {
    const seats = seatCode(code, { gameTag: no })
    const [me, partner] = ofRole(seats, role)
    const built = startAs(seats, me)
    assert.deepEqual(allyIds(built), role === "CITIZEN" ? [] : [partner.uuid])
  })
})

test("A02-F-061 9명 players 순서 → 판 화면 사람 순서 같음", () => {
  const seats = seatPlayers(autoCounts(9), { gameTag: "f061" })
  const built = startAs(seats, firstOf(seats, "GUARD"))
  assert.deepEqual(built.sourcePlayers.map((p) => p.id), seats.map((p) => p.uuid))
  assert.deepEqual(built.sourcePlayers.map((p) => p.name), seats.map((p) => p.nickname))
})

test("A02-F-062 5명 시작 → 모두 산 사람", () => {
  const seats = seatPlayers(autoCounts(5), { gameTag: "f062" })
  const built = startAs(seats, firstOf(seats, "JOKER"))
  assert.equal(built.sourcePlayers.length, 5)
  assert.deepEqual(built.sourcePlayers.map((p) => p.alive), [true, true, true, true, true])
})
