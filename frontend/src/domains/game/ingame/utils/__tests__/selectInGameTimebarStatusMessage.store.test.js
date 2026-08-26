import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { selectInGameTimebarStatusMessage } = await import("../selectInGameTimebarStatusMessage.js")

/**
 * 실제 React 렌더 + 실제 zustand store로 "canonical 상태가 바뀌면 인디케이터 문구가 갱신되는가"를
 * 증명한다. 인디케이터 컴포넌트(.jsx)는 이 저장소의 node:test 실행에 로더가 없어 직접 렌더할 수
 * 없으므로(InGameTimebar.productionSource.test.js의 제약과 동일), 컴포넌트가 값을 얻는 것과
 * 완전히 같은 구독 경로를 여기서 렌더한다. 그 값이 실제 DOM으로 꽂히는 배선은
 * InGameTimebar/InGamePage의 productionSource 테스트가 맡는다.
 *
 * 이 파일은 소켓 모듈을 단 하나도 import하지 않는다 — 그런데도 턴 변경이 문구에 반영된다는
 * 사실 자체가 "별도 소켓 구독·타이밍 로직 없이 canonical 값에서만 파생한다"의 증거다.
 */
const GAME_ID = "game-status-bar"

function seed(state) {
  useInGameStore.getState().setGamePayload({ gameId: GAME_ID, state: { id: GAME_ID, ...state } })
}

function renderStatus() {
  return renderHook(() => useInGameStore((s) => selectInGameTimebarStatusMessage(s.state)))
}

test("NIGHT 턴이 바뀌면 인디케이터 문구가 그 턴의 문구로 갱신된다", () => {
  seed({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER" })
  const hook = renderStatus()
  assert.equal(hook.result.current, "광대의 시간입니다")

  act(() => {
    useInGameStore.getState().applyNightTurnChanged({
      gameId: GAME_ID,
      phase: "NIGHT",
      dayIndex: 1,
      nightTurnRole: "DOCTOR",
    })
  })
  assert.equal(hook.result.current, "의사의 시간입니다")

  act(() => {
    useInGameStore.getState().applyNightTurnChanged({
      gameId: GAME_ID,
      phase: "NIGHT",
      dayIndex: 1,
      nightTurnRole: "GUARD",
    })
  })
  assert.equal(hook.result.current, "경호원의 시간입니다")

  hook.unmount()
})

test("nightTurnRole: null 방송은 '지목된 턴이 없음'이므로 그 밤의 canonical 시작 턴 문구로 돌아간다", () => {
  // selectInGameNightTurnRole의 기존 판정을 그대로 물려받은 결과다 — null은 "턴 없음"이 아니라
  // "서버가 턴을 지목하지 않음"이고, 그때의 canonical 턴은 그 밤의 시작 턴 하나다.
  seed({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "GUARD" })
  const hook = renderStatus()
  assert.equal(hook.result.current, "경호원의 시간입니다")

  act(() => {
    useInGameStore.getState().applyNightTurnChanged({
      gameId: GAME_ID,
      phase: "NIGHT",
      dayIndex: 1,
      nightTurnRole: null,
    })
  })
  assert.equal(hook.result.current, "광대의 시간입니다")

  hook.unmount()
})

test("첫 밤(dayIndex 0)의 마녀사냥꾼 턴 방송에도 문구가 그대로 뜬다", () => {
  // 시신이 없는 밤에는 서버가 이 턴을 방송하지 않으므로, 방송이 온 이상 프런트가 dayIndex로
  // 되돌려 막지 않는다 — canonical 턴을 그대로 따른다.
  seed({ phase: "NIGHT", dayIndex: 0, nightTurnRole: "JOKER" })
  const hook = renderStatus()
  assert.equal(hook.result.current, "광대의 시간입니다")

  act(() => {
    useInGameStore.getState().applyNightTurnChanged({
      gameId: GAME_ID,
      phase: "NIGHT",
      dayIndex: 0,
      nightTurnRole: "WITCH_HUNTER",
    })
  })
  assert.equal(hook.result.current, "마녀사냥꾼의 시간입니다")

  hook.unmount()
})

test("다른 게임의 stale한 턴 방송은 문구를 흔들지 않는다", () => {
  seed({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER" })
  const hook = renderStatus()

  act(() => {
    useInGameStore.getState().applyNightTurnChanged({
      gameId: "other-game",
      phase: "NIGHT",
      dayIndex: 1,
      nightTurnRole: "DOCTOR",
    })
  })
  assert.equal(hook.result.current, "광대의 시간입니다")

  hook.unmount()
})

test("DAY / TRIBUNAL / ENDED 상태에서는 각 단계 문구(ENDED는 문구 없음)를 그린다", () => {
  seed({ phase: "DAY", dayIndex: 2 })
  const hook = renderStatus()
  assert.equal(hook.result.current, "낮 — 토론과 투표")

  act(() => {
    seed({ phase: "TRIBUNAL", dayIndex: 2 })
  })
  assert.equal(hook.result.current, "재판 진행 중")

  act(() => {
    seed({ phase: "ENDED", dayIndex: 2 })
  })
  assert.equal(hook.result.current, null)

  hook.unmount()
})
