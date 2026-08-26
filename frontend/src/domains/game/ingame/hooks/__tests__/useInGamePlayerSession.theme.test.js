import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

/**
 * 이 스위트는 "참가자 색은 서버 colorIndex에서만 온다"는 계약을 실제 React 렌더로 증명한다.
 * 카드(InGamePlayerCard.jsx)와 채팅(InGameChatMessageRow.jsx)은 .jsx라 이 저장소의 node:test
 * 실행에 JSX 로더가 없어 직접 렌더할 수 없지만, 두 컴포넌트가 색으로 읽는 값은 전부 여기서
 * 검증하는 getThemeByPlayerId / getThemeStylesByPlayerId 결과다 — 카드는 그 styles.color를
 * 프레임 stroke와 명패에, 채팅은 같은 값을 닉네임 inline color에 넣는다(배선 자체는
 * InGamePlayerCard.playerColor.test.js / InGameChatMessageRow.playerColor.test.js가 지킨다).
 */

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

// 이 훅은 preview 더미를 만들며 pickInGamePlayerFrame을 타고 vite alias("@/shared/...")로 들어가는데,
// node:test에는 alias 해석이 없어 실제 모듈이 resolve되지 않는다. 프레임 PNG 경로는 색과 아무
// 관계가 없으므로 그 한 모듈만 fake로 교체한다(다른 훅 테스트와 동일한 mock.module 관례) —
// 테마·병합·세션 조회 경로는 전부 실제 프로덕션 코드 그대로 돈다. mock.module은 아직 로드되지
// 않은 specifier에만 적용되므로 훅 모듈은 이 등록 이후의 동적 import로 가져온다.
mock.module("../../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGamePlayerFrame: (index) => `frame-${index}.png`,
    resolveInGamePlayerFrameSrc: (aliveFrameSrc) => aliveFrameSrc,
  },
})

const { useInGamePlayerSession } = await import("../useInGamePlayerSession.js")
const { INGAME_PLAYER_THEME_PALETTE } = await import(
  "../../constants/ingamePlayerTheme.js"
)

function renderSession(sourcePlayers) {
  return renderHook(() =>
    useInGamePlayerSession({ sourcePlayers, localPlayerId: sourcePlayers[0].id }),
  )
}

test("colorIndex를 가진 참가자는 그 인덱스의 팔레트 색으로 그려진다", () => {
  const hook = renderSession([
    { id: "u1", name: "A", connected: true, alive: true, colorIndex: 7 },
  ])

  const theme = hook.result.current.getThemeByPlayerId("u1")
  assert.equal(theme.color, INGAME_PLAYER_THEME_PALETTE[7].color)
  assert.equal(theme.paletteIndex, 7)

  // 카드 stroke·명패, 채팅 닉네임이 실제로 읽는 값
  const styles = hook.result.current.getThemeStylesByPlayerId("u1")
  assert.equal(styles.color, INGAME_PLAYER_THEME_PALETTE[7].color)

  hook.unmount()
})

test("colorIndex가 없는 참가자(구세션)는 테마가 null이고 조회가 throw하지 않는다", () => {
  const hook = renderSession([{ id: "u1", name: "A", connected: true, alive: true }])

  assert.equal(hook.result.current.getThemeByPlayerId("u1"), null)
  assert.equal(hook.result.current.getThemeStylesByPlayerId("u1"), null)
  assert.equal(hook.result.current.getThemeStylesByPlayerId("u1", { emphasized: true }), null)
  assert.equal(hook.result.current.getPlayerById("u1").themeIndex, null)

  hook.unmount()
})

test("colorIndex가 형태부터 어긋나도(-1·문자열·소수) 화면이 죽지 않고 기본색으로 떨어진다", () => {
  for (const badColorIndex of [-1, "3", 1.5, null]) {
    const hook = renderSession([
      { id: "u1", name: "A", connected: true, alive: true, colorIndex: badColorIndex },
    ])

    assert.equal(hook.result.current.getThemeByPlayerId("u1"), null)
    assert.equal(hook.result.current.getThemeStylesByPlayerId("u1"), null)

    hook.unmount()
  }
})

test("emphasized 조회도 colorIndex 색을 따르고 stroke만 두꺼워진다", () => {
  const hook = renderSession([
    { id: "u1", name: "A", connected: true, alive: true, colorIndex: 2 },
  ])

  const base = hook.result.current.getThemeStylesByPlayerId("u1")
  const emphasized = hook.result.current.getThemeStylesByPlayerId("u1", { emphasized: true })

  assert.equal(emphasized.color, INGAME_PLAYER_THEME_PALETTE[2].color)
  assert.equal(emphasized.color, base.color)
  assert.ok(emphasized.frameStrokeScale > base.frameStrokeScale)

  hook.unmount()
})

test("참가자마다 colorIndex가 다르면 서로 다른 색으로 그려진다", () => {
  const hook = renderSession([
    { id: "u1", name: "A", connected: true, alive: true, colorIndex: 0 },
    { id: "u2", name: "B", connected: true, alive: true, colorIndex: 1 },
    { id: "u3", name: "C", connected: true, alive: true, colorIndex: 9 },
  ])

  const colors = ["u1", "u2", "u3"].map(
    (id) => hook.result.current.getThemeByPlayerId(id).color,
  )
  assert.deepEqual(colors, [
    INGAME_PLAYER_THEME_PALETTE[0].color,
    INGAME_PLAYER_THEME_PALETTE[1].color,
    INGAME_PLAYER_THEME_PALETTE[9].color,
  ])

  hook.unmount()
})

test("서버 참가자는 같은 슬롯 preview의 색을 물려받지 않는다 — colorIndex가 이긴다", () => {
  // 슬롯 0의 preview 색은 팔레트 0번이다(결정적 배정). 그 슬롯에 colorIndex 5를 주면
  // 결과는 반드시 5번 색이어야 한다.
  const hook = renderSession([
    { id: "u1", name: "A", connected: true, alive: true, colorIndex: 5 },
  ])

  const theme = hook.result.current.getThemeByPlayerId("u1")
  assert.equal(theme.color, INGAME_PLAYER_THEME_PALETTE[5].color)
  assert.notEqual(theme.color, INGAME_PLAYER_THEME_PALETTE[0].color)

  hook.unmount()
})

test("같은 sourcePlayers는 몇 번을 렌더해도 같은 색을 낸다(창 간 일관성의 기반)", () => {
  const sourcePlayers = [
    { id: "u1", name: "A", connected: true, alive: true, colorIndex: 3 },
    { id: "u2", name: "B", connected: true, alive: true, colorIndex: 8 },
  ]

  const first = renderSession(sourcePlayers)
  const firstColors = ["u1", "u2"].map((id) => first.result.current.getThemeByPlayerId(id).color)
  first.unmount()

  const second = renderSession(sourcePlayers)
  const secondColors = ["u1", "u2"].map((id) => second.result.current.getThemeByPlayerId(id).color)
  second.unmount()

  assert.deepEqual(firstColors, secondColors)
})
