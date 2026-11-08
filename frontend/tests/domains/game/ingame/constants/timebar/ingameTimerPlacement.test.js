import assert from "node:assert/strict"
import test from "node:test"
import {
  INGAME_TIMER_PLACEMENT,
  readInGameTimerPlacement,
  readInGameTimerPlacementFromSearch,
} from "../../../../../../src/domains/game/ingame/constants/timebar/ingameTimerPlacement.js"

test("readInGameTimerPlacementFromSearch: timerPlacement 쿼리", () => {
  assert.equal(readInGameTimerPlacementFromSearch("?timerPlacement=chat"), INGAME_TIMER_PLACEMENT.CHAT)
  assert.equal(readInGameTimerPlacementFromSearch("?timerPlacement=timebar"), INGAME_TIMER_PLACEMENT.TIMEBAR)
  assert.equal(readInGameTimerPlacementFromSearch(""), null)
})

test("readInGameTimerPlacement: 쿼리 > storage > prod 기본 timebar", () => {
  const storage = {
    _v: null,
    getItem() {
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

test("저장소를 꺼내기만 해도 던지는 브라우저에서도 기본값으로 읽고 저장은 조용히 넘어감", async () => {
  const { writeInGameTimerPlacement } = await import(
    "../../../../../../src/domains/game/ingame/constants/timebar/ingameTimerPlacement.js"
  )
  const blockedWindow = { location: { search: "" } }
  Object.defineProperty(blockedWindow, "localStorage", {
    get() { throw new Error("SecurityError") },
  })
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { value: blockedWindow, configurable: true, writable: true })
  try {
    assert.equal(readInGameTimerPlacement(), INGAME_TIMER_PLACEMENT.TIMEBAR)
    assert.doesNotThrow(() => writeInGameTimerPlacement(INGAME_TIMER_PLACEMENT.CHAT))
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous)
    else delete globalThis.window
  }
})
