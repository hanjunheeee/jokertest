import test from "node:test"
import assert from "node:assert/strict"

import { buildInGameKillRevealQueueItems } from "../buildInGameKillRevealQueueItems.js"

const ROSTER = new Set(["p1", "p2", "p3"])

function baseArgs(overrides = {}) {
  return { gameId: "g1", authUuid: "u1", epoch: "epoch-1", canonicalPlayerIds: ROSTER, ...overrides }
}

test("정상 nightResult(단일 희생자)는 항목 하나를 만든다", () => {
  const items = buildInGameKillRevealQueueItems(
    baseArgs({ nightResult: { dayIndex: 1, deathReveals: [{ victimUuid: "p1", source: "JOKER" }] } }),
  )
  assert.equal(items.length, 1)
  assert.equal(items[0].victimUuid, "p1")
  assert.equal(items[0].source, "JOKER")
  assert.equal(typeof items[0].id, "string")
  assert.ok(items[0].id.length > 0)
})

test("deathReveals가 없거나 빈 배열이면(보호 성공·무득표) 빈 배열을 돌려준다(요구사항: no video)", () => {
  assert.deepEqual(
    buildInGameKillRevealQueueItems(baseArgs({ nightResult: { dayIndex: 1, deathReveals: [] } })),
    [],
  )
  assert.deepEqual(
    buildInGameKillRevealQueueItems(baseArgs({ nightResult: { dayIndex: 1 } })),
    [],
  )
})

test("여러 희생자가 있으면(멀티 킬) 각각 별개 항목으로 payload 순서 그대로 만든다", () => {
  const items = buildInGameKillRevealQueueItems(
    baseArgs({
      nightResult: {
        dayIndex: 2,
        deathReveals: [
          { victimUuid: "p1", source: "JOKER" },
          { victimUuid: "p2", source: "WITCH_HUNTER" },
        ],
      },
    }),
  )
  assert.equal(items.length, 2)
  assert.deepEqual(items.map((i) => i.victimUuid), ["p1", "p2"])
})

test("canonicalPlayerIds roster에 없는 victimUuid는 걸러진다(위조/낡은 값 방어)", () => {
  const items = buildInGameKillRevealQueueItems(
    baseArgs({
      nightResult: {
        dayIndex: 1,
        deathReveals: [
          { victimUuid: "ghost", source: "JOKER" },
          { victimUuid: "p2", source: "OTHER" },
        ],
      },
    }),
  )
  assert.equal(items.length, 1)
  assert.equal(items[0].victimUuid, "p2")
})

test("canonicalPlayerIds를 넘기지 않으면(Set이 아니면) roster 필터링 없이 통과한다(기존 동작 호환)", () => {
  const items = buildInGameKillRevealQueueItems({
    gameId: "g1",
    authUuid: "u1",
    epoch: "epoch-1",
    nightResult: { dayIndex: 1, deathReveals: [{ victimUuid: "unknown", source: "OTHER" }] },
  })
  assert.equal(items.length, 1)
})

test("같은 payload 안에 완전히 동일한 identity가 중복이면 한 번만 남긴다", () => {
  const items = buildInGameKillRevealQueueItems(
    baseArgs({
      nightResult: {
        dayIndex: 1,
        deathReveals: [
          { victimUuid: "p1", source: "JOKER" },
          { victimUuid: "p1", source: "JOKER" },
        ],
      },
    }),
  )
  assert.equal(items.length, 1)
})

test("서로 다른 dayIndex/gameId/authUuid/epoch는 서로 다른 id를 만든다(재생 identity 분리)", () => {
  const base = baseArgs({ nightResult: { dayIndex: 1, deathReveals: [{ victimUuid: "p1", source: "JOKER" }] } })
  const idA = buildInGameKillRevealQueueItems(base)[0].id

  const idDayIndex = buildInGameKillRevealQueueItems({
    ...base,
    nightResult: { dayIndex: 2, deathReveals: [{ victimUuid: "p1", source: "JOKER" }] },
  })[0].id
  const idGameId = buildInGameKillRevealQueueItems({ ...base, gameId: "g2" })[0].id
  const idEpoch = buildInGameKillRevealQueueItems({ ...base, epoch: "epoch-2" })[0].id

  assert.notEqual(idA, idDayIndex)
  assert.notEqual(idA, idGameId)
  assert.notEqual(idA, idEpoch)
})

test("gameId/authUuid가 없거나 nightResult 형태가 불량이면 빈 배열이다", () => {
  const valid = { dayIndex: 1, deathReveals: [{ victimUuid: "p1", source: "JOKER" }] }
  assert.deepEqual(buildInGameKillRevealQueueItems(baseArgs({ gameId: "", nightResult: valid })), [])
  assert.deepEqual(buildInGameKillRevealQueueItems(baseArgs({ authUuid: "", nightResult: valid })), [])
  assert.deepEqual(buildInGameKillRevealQueueItems(baseArgs({ nightResult: null })), [])
  assert.deepEqual(buildInGameKillRevealQueueItems(baseArgs({ nightResult: { dayIndex: -1, deathReveals: [] } })), [])
})

test("알 수 없는 source·형태 불량 원소는 그 원소만 조용히 무시된다", () => {
  const items = buildInGameKillRevealQueueItems(
    baseArgs({
      nightResult: {
        dayIndex: 1,
        deathReveals: [
          { victimUuid: "p1", source: "UNKNOWN_SOURCE" },
          { victimUuid: "p2", source: "OTHER" },
        ],
      },
    }),
  )
  assert.equal(items.length, 1)
  assert.equal(items[0].victimUuid, "p2")
})
