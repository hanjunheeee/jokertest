import assert from "node:assert/strict"
import test from "node:test"
import {
  INGAME_TIMER_PLACEMENT,
  readInGameTimerPlacement,
  readInGameTimerPlacementFromSearch,
} from "../ingameTimerPlacement.js"

test("readInGameTimerPlacementFromSearch: timerPlacement 쿼리", () => {
  assert.equal(readInGameTimerPlacementFromSearch("?timerPlacement=chat"), INGAME_TIMER_PLACEMENT.CHAT)
  assert.equal(readInGameTimerPlacementFromSearch("?timerPlacement=timebar"), INGAME_TIMER_PLACEMENT.TIMEBAR)
  assert.equal(readInGameTimerPlacementFromSearch(""), null)
})

test("readInGameTimerPlacement: 쿼리 > storage > prod 기본 timebar", () => {
  const storage = {
    _v: null,
    getItem(k) {
      return this._v
    },
    setItem(k, v) {
      this._v = v
    },
  }
  storage.setItem("x", INGAME_TIMER_PLACEMENT.TIMEBAR)
  assert.equal(
    readInGameTimerPlacement({ search: "?timerPlacement=chat", storage }),
    INGAME_TIMER_PLACEMENT.CHAT,
  )
  assert.equal(
    readInGameTimerPlacement({ search: "", storage }),
    INGAME_TIMER_PLACEMENT.TIMEBAR,
  )
})
