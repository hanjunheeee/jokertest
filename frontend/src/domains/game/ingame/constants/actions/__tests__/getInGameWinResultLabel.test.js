import test from "node:test"
import assert from "node:assert/strict"

import {
  getInGameWinResultLabel,
} from "../ingameActionPanel.js"

test("getInGameWinResultLabel: CITIZEN 승리는 시민 진영 승리 문구를 반환한다", () => {
  assert.equal(
    getInGameWinResultLabel({ winner: "CITIZEN" }),
    "시민 진영 승리",
  )
})

test("getInGameWinResultLabel: JOKER 승리는 JOKER 진영 승리 문구를 반환한다", () => {
  assert.equal(
    getInGameWinResultLabel({ winner: "JOKER" }),
    "JOKER 진영 승리",
  )
})

test("getInGameWinResultLabel: 종료 결과가 없거나 구조가 잘못되면 null을 반환한다", () => {
  assert.equal(getInGameWinResultLabel(undefined), null)
  assert.equal(getInGameWinResultLabel(null), null)
  assert.equal(getInGameWinResultLabel("CITIZEN"), null)
  assert.equal(getInGameWinResultLabel([]), null)
  assert.equal(getInGameWinResultLabel({}), null)
  assert.equal(getInGameWinResultLabel({ winner: "UNKNOWN" }), null)
})
