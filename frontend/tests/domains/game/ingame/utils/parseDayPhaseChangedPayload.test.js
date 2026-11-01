import test from "node:test"
import assert from "node:assert/strict"

import { parseDayPhaseChangedPayload } from "../../../../../src/domains/game/ingame/utils/dayPhase.js"

const CONTEXT = { gameId: "game-1", dayIndex: 2 }

function validPayload(overrides = {}) {
  return { gameId: "game-1", dayIndex: 2, dayPhase: "DAY_VOTE", round: 1, ...overrides }
}

const rejectedCases = [
  ["payload가 undefined면 거부된다", undefined, {}],
  ["payload가 null이면 거부된다", null, {}],
  ["payload가 배열이면 거부된다", ["game-1", "DAY_VOTE"], {}],
  ["payload가 문자열이면 거부된다", "game-1", {}],
  ["gameId가 없으면 거부된다", { dayIndex: 2, dayPhase: "DAY_VOTE", round: 1 }, {}],
  ["gameId가 빈 문자열이면 거부된다", validPayload({ gameId: "   " }), {}],
  ["gameId가 문자열이 아니면 거부된다", validPayload({ gameId: 1 }), {}],
  ["다른 gameId면 거부된다", validPayload({ gameId: "game-other" }), {}],
  ["활성 gameId가 없으면 거부된다", validPayload(), { gameId: null }],
  ["dayIndex가 정수가 아니면 거부된다", validPayload({ dayIndex: "2" }), {}],
  ["dayIndex가 현재 낮과 다르면 거부된다", validPayload({ dayIndex: 3 }), {}],
  ["현재 dayIndex가 정수가 아니면 거부된다", validPayload(), { dayIndex: undefined }],
  ["dayPhase가 없으면 거부된다", { gameId: "game-1", dayIndex: 2, round: 1 }, {}],
  ["dayPhase가 DAY_DISCUSSION이면 거부된다(되돌리는 전이는 계약에 없다)", validPayload({ dayPhase: "DAY_DISCUSSION" }), {}],
  ["dayPhase가 미지값이면 거부된다", validPayload({ dayPhase: "DAY_LUNCH" }), {}],
  ["round가 정수가 아니면 거부된다", validPayload({ round: 1.5 }), {}],
  ["round가 0이면 거부된다", validPayload({ round: 0 }), {}],
  ["round가 없으면 거부된다", { gameId: "game-1", dayIndex: 2, dayPhase: "DAY_VOTE" }, {}],
]

for (const [label, payload, contextOverrides] of rejectedCases) {
  test(`parseDayPhaseChangedPayload: ${label}`, () => {
    const parsed = parseDayPhaseChangedPayload({ ...CONTEXT, ...contextOverrides, payload })
    assert.equal(parsed, null)
  })
}

test("parseDayPhaseChangedPayload: 정상 payload는 정규화된 네 필드만 돌려준다", () => {
  const parsed = parseDayPhaseChangedPayload({ ...CONTEXT, payload: validPayload() })

  assert.deepEqual(parsed, { gameId: "game-1", dayIndex: 2, dayPhase: "DAY_VOTE", round: 1 })
  assert.deepEqual(Object.keys(parsed).sort(), ["dayIndex", "dayPhase", "gameId", "round"])
})

test("parseDayPhaseChangedPayload: 재투표 라운드(round>1)도 통과하고, payload의 여분 필드는 버려진다", () => {
  const parsed = parseDayPhaseChangedPayload({
    ...CONTEXT,
    payload: validPayload({ round: 3, role: "JOKER", players: [{ uuid: "p1" }] }),
  })

  assert.deepEqual(parsed, { gameId: "game-1", dayIndex: 2, dayPhase: "DAY_VOTE", round: 3 })
})

test("parseDayPhaseChangedPayload: dayIndex 0(첫 밤 이전)도 정수 일치면 통과한다", () => {
  const parsed = parseDayPhaseChangedPayload({
    gameId: "game-1",
    dayIndex: 0,
    payload: validPayload({ dayIndex: 0 }),
  })

  assert.equal(parsed.dayIndex, 0)
})
