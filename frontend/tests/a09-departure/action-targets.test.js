// [B07-1] 생사는 끊김과 따로 보는지 시험(화면 상태): 생사 판단·낮 투표 대상·밤 대상 고를 수 있나 (죽고 끊긴 사람이 산 사람으로 안 들어감)
// 목록 A09-끊김-나가기-탈주.md A09-F-088~111, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/action-targets.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { isSessionPlayerAlive, buildDayVoteTargets, buildNightActionTargets } = await import("../../src/domains/game/ingame/utils/actionTargets.js")

test.afterEach(() => K.reset())

// 생사 판단 표 (값 4)
const ALIVE_CASES = [
  ["A09-F-088", "{끊김, alive false}", { status: "disconnected", alive: false }, false],
  ["A09-F-089", "{끊김, alive 없음}", { status: "disconnected" }, true],
  ["A09-F-090", "{사망}", { status: "dead" }, false],
  ["A09-F-091", "{생존, alive true}", { status: "alive", alive: true }, true],
]
for (const [id, name, player, alive] of ALIVE_CASES) {
  test(`${id} ${name} → ${alive ? "삶" : "죽음"}`, () => {
    assert.equal(isSessionPlayerAlive(player), alive)
  })
}

// 대상 4종 자리: 1 산·연결 / 2 산·끊김 / 3 죽음·연결 / 4 죽음·끊김 (모두 시민, 나는 0)
const TARGETS = [
  [1, "산·연결", true],
  [2, "산·끊김", true],
  [3, "죽음·연결", false],
  [4, "죽음·끊김", false],
]

// 낮 투표 대상 (값 4): 산 둘만 대상, 산·끊김은 connected false
TARGETS.forEach(([seatNo, name, alive], i) => {
  const id = `A09-F-${String(92 + i).padStart(3, "0")}`
  test(`${id} 6명 판 낮 투표 대상: ${name} 사람 → ${alive ? "대상" : "대상 아님"}`, () => {
    const t = K.seat({ n: 6, me: 0, jokers: [5], dead: [3, 4], disconnected: [2, 4] })
    const targets = buildDayVoteTargets(K.sessionPlayers(), { localPlayerId: t.me })
    const found = targets.find((target) => target.id === t.uuid(seatNo)) ?? null
    assert.equal(found !== null, alive)
    if (found) assert.equal(found.connected, seatNo !== 2)
  })
})

// 밤 대상 고를 수 있나 (값 16): 내 직업 4 × 대상 4종, 광대·의사·경비원은 산 둘만, 마녀사냥꾼은 죽은 둘만
const ROLES = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]
let no = 96
for (const role of ROLES) {
  for (const [seatNo, name, alive] of TARGETS) {
    const id = `A09-F-${String(no).padStart(3, "0")}`
    no += 1
    const selectable = role === "WITCH_HUNTER" ? !alive : alive
    test(`${id} 8명 판 밤 내 직업 ${K.ROLE_LABELS[role]} · 대상 ${name} → ${selectable ? "고를 수 있음" : "못 고름"}`, () => {
      // 같은 직업 동료는 7번 자리 (대상 4종과 안 겹치게)
      const t = K.seat({
        n: 8, me: 0, roles: { 0: role, 7: role }, jokers: role === "JOKER" ? [] : [6],
        dead: [3, 4], disconnected: [2, 4], phase: "NIGHT", dayIndex: 2, nightTurnRole: role,
      })
      const targets = buildNightActionTargets(K.sessionPlayers(), { localPlayerId: t.me, selfTargetAllowed: role === "DOCTOR", role })
      const found = targets.find((target) => target.id === t.uuid(seatNo)) ?? null
      assert.ok(found !== null, "대상 목록에 줄이 없음")
      assert.equal(found.selectable, selectable)
    })
  }
}
