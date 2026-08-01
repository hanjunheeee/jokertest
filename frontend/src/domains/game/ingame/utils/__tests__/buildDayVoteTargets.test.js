import test from "node:test"
import assert from "node:assert/strict"

import { buildDayVoteTargets, isSessionPlayerAlive } from "../buildDayVoteTargets.js"
import { INGAME_PLAYER_STATUS } from "../../constants/board/status/ingamePlayerStatus.js"

function sessionPlayer(overrides = {}) {
  return { id: "p1", nickname: "닉네임", status: INGAME_PLAYER_STATUS.ALIVE, ...overrides }
}

test("isSessionPlayerAlive: status가 ALIVE/DISCONNECTED면 true, DEAD면 false다", () => {
  assert.equal(isSessionPlayerAlive(sessionPlayer({ status: INGAME_PLAYER_STATUS.ALIVE })), true)
  assert.equal(isSessionPlayerAlive(sessionPlayer({ status: INGAME_PLAYER_STATUS.DISCONNECTED })), true)
  assert.equal(isSessionPlayerAlive(sessionPlayer({ status: INGAME_PLAYER_STATUS.DEAD })), false)
})

test("buildDayVoteTargets: 배열이 아니면 빈 배열을 반환한다", () => {
  assert.deepEqual(buildDayVoteTargets(null, { localPlayerId: "p1" }), [])
  assert.deepEqual(buildDayVoteTargets(undefined, { localPlayerId: "p1" }), [])
})

test("buildDayVoteTargets: 살아있는 타인 전원을 포함하고 본인과 사망자는 제외한다", () => {
  const players = [
    sessionPlayer({ id: "self", status: INGAME_PLAYER_STATUS.ALIVE }),
    sessionPlayer({ id: "alive-other", nickname: "생존자", status: INGAME_PLAYER_STATUS.ALIVE }),
    sessionPlayer({ id: "dead-other", nickname: "사망자", status: INGAME_PLAYER_STATUS.DEAD }),
  ]

  const result = buildDayVoteTargets(players, { localPlayerId: "self" })

  assert.deepEqual(
    result.map((p) => p.id),
    ["alive-other"],
  )
})

test("buildDayVoteTargets: 필드 매핑이 {id, name, alive, connected}이고 이름은 nickname에서 온다", () => {
  const players = [
    sessionPlayer({ id: "self" }),
    sessionPlayer({ id: "other", nickname: "홍길동", status: INGAME_PLAYER_STATUS.ALIVE }),
  ]

  const result = buildDayVoteTargets(players, { localPlayerId: "self" })

  assert.deepEqual(result, [{ id: "other", name: "홍길동", alive: true, connected: true }])
})

test("buildDayVoteTargets: 연결 끊긴 생존자는 목록에 포함되되 connected:false로 표시된다", () => {
  const players = [
    sessionPlayer({ id: "self" }),
    sessionPlayer({ id: "disconnected-other", nickname: "끊김", status: INGAME_PLAYER_STATUS.DISCONNECTED }),
  ]

  const result = buildDayVoteTargets(players, { localPlayerId: "self" })

  assert.deepEqual(result, [{ id: "disconnected-other", name: "끊김", alive: true, connected: false }])
})

test("buildDayVoteTargets(회귀): 살아있는 동료 JOKER(isAlly:true/role:'JOKER')도 결과에 포함된다 — 진영 필드는 결과에 영향을 주지 않는다", () => {
  const players = [
    sessionPlayer({ id: "self", role: "JOKER", team: "JOKER" }),
    sessionPlayer({ id: "ally-joker", nickname: "동료 조커", status: INGAME_PLAYER_STATUS.ALIVE, isAlly: true }),
    sessionPlayer({ id: "citizen", nickname: "시민", status: INGAME_PLAYER_STATUS.ALIVE }),
  ]

  const result = buildDayVoteTargets(players, { localPlayerId: "self" })

  assert.deepEqual(
    result.map((p) => p.id).sort(),
    ["ally-joker", "citizen"].sort(),
  )
  for (const target of result) {
    assert.equal(Object.hasOwn(target, "role"), false)
    assert.equal(Object.hasOwn(target, "isAlly"), false)
    assert.equal(Object.hasOwn(target, "team"), false)
  }
})
