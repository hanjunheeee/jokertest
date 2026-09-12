import assert from "node:assert/strict"
import test from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-15: node:test 실행에는 기본 JSX 로더가 없다 — 다른 F-15 시험(GeneralSettingsTab.test.js,
// SettingChatTab.test.js)과 같은 jsxNodeLoaderHooks.mjs를 재사용해 실제 컴포넌트를 그대로
// 마운트한다.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, cleanup, act, renderHook } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { default: InGameChatMessageRow } = await import("../InGameChatMessageRow.jsx")
const { default: InGameChatMessageList } = await import("../InGameChatMessageList.jsx")
const { InGameChatVariantContext } = await import("../InGameChatVariantContext.jsx")
const { InGamePlayerSessionContext } = await import("../../InGamePlayerSessionContext.js")
const { useSettingsStore } = await import("../../../../../settings/store/settingsStore.js")
const { resolveInGamePlayerThemeByColorIndex } = await import(
  "../../../constants/ingamePlayerTheme.js"
)
const { INGAME_CHAT_TEXT_SCALE_CSS_VAR } = await import(
  "../../../constants/chat/ingameChatLayout.js"
)
const { useInGamePlayerSession } = await import("../../../hooks/useInGamePlayerSession.js")
const { INGAME_PLAYER_THEME_PALETTE } = await import("../../../constants/ingamePlayerTheme.js")

const theme0 = resolveInGamePlayerThemeByColorIndex(0)

/** jsdom의 CSSOM은 대입한 색 문자열을 그대로 돌려주지 않을 수 있다(예: #hex → rgb(...)
 *  정규화). 정확한 직렬화 포맷에 기대지 않도록, 같은 document에서 같은 값을 대입한
 *  결과와 비교해 "실제로 이 색이 적용됐는가"만 확인한다. */
function normalizedColor(color) {
  const probe = document.createElement("span")
  probe.style.color = color
  return probe.style.color
}

function renderRow({ variant = "board", sentAt = null, playerId = "p1" } = {}) {
  const session = { getThemeStylesByPlayerId: () => theme0.styles }

  return render(
    React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: session },
      React.createElement(
        InGameChatVariantContext.Provider,
        { value: variant },
        React.createElement(InGameChatMessageRow, {
          playerId,
          senderName: "Alice",
          text: "hello",
          sentAt,
        }),
      ),
    ),
  )
}

test.beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({ chatChecks: null, chatTextSize: null })
})

// F-15(AC-02/AC-04): 이전 구현은 resolveInGameChatPlayerColor 내부에서 getState()만
// 읽어, 이미 마운트된 메시지 행이 설정 변경에 반응해 다시 그려지지 않는 버그가 있었다.
// 이 시험은 컴포넌트를 다시 마운트하지 않고 store만 바꿔 실제로 다시 그려지는지 확인한다.
test("마운트된 채로 닉네임 색상 표시를 켜면 같은 메시지가 다시 그려져 색이 적용된다", () => {
  useSettingsStore.setState({ chatChecks: { "nickname-color": false } })
  const { container } = renderRow()

  const senderSpan = container.querySelector("li > span:first-child")
  assert.equal(senderSpan.style.color, "", "꺼진 상태에서는 색이 없어야 한다")

  act(() => {
    useSettingsStore.setState((s) => ({ chatChecks: { ...s.chatChecks, "nickname-color": true } }))
  })

  const senderSpanAfter = container.querySelector("li > span:first-child")
  assert.equal(senderSpanAfter.style.color, normalizedColor(theme0.styles.color))
})

test("마운트된 채로 닉네임 색상 표시를 끄면 같은 메시지가 다시 그려져 색이 사라진다", () => {
  useSettingsStore.setState({ chatChecks: { "nickname-color": true } })
  const { container } = renderRow()

  const senderSpan = container.querySelector("li > span:first-child")
  assert.equal(senderSpan.style.color, normalizedColor(theme0.styles.color))

  act(() => {
    useSettingsStore.setState((s) => ({ chatChecks: { ...s.chatChecks, "nickname-color": false } }))
  })

  const senderSpanAfter = container.querySelector("li > span:first-child")
  assert.equal(senderSpanAfter.style.color, "")
})

// F-15(AC-02): 채팅 시간 표시 — sentAt이 있을 때만, 설정이 켜져 있을 때만 보인다.
test("채팅 시간 표시가 꺼져 있으면 sentAt이 있어도 시각이 보이지 않는다", () => {
  useSettingsStore.setState({ chatChecks: { "show-time": false } })
  const sentAt = Date.UTC(2026, 0, 1, 9, 5)
  const { queryByText } = renderRow({ sentAt })

  assert.equal(queryByText(/^\d{2}:\d{2}$/), null)
})

test("마운트된 채로 채팅 시간 표시를 켜면 같은 메시지에 sentAt 기준 시각이 나타난다", () => {
  useSettingsStore.setState({ chatChecks: { "show-time": false } })
  const sentAt = new Date(2026, 0, 1, 9, 5).getTime()
  const { queryByText, getByText } = renderRow({ sentAt })

  assert.equal(queryByText(/^\d{2}:\d{2}$/), null)

  act(() => {
    useSettingsStore.setState((s) => ({ chatChecks: { ...s.chatChecks, "show-time": true } }))
  })

  const expected = `${String(new Date(sentAt).getHours()).padStart(2, "0")}:${String(
    new Date(sentAt).getMinutes(),
  ).padStart(2, "0")}`
  assert.notEqual(getByText(expected), null)
})

test("sentAt이 없으면 채팅 시간 표시가 켜져 있어도 시각을 그리지 않는다", () => {
  useSettingsStore.setState({ chatChecks: { "show-time": true } })
  const { queryByText } = renderRow({ sentAt: null })

  assert.equal(queryByText(/^\d{2}:\d{2}$/), null)
})

// F-15(AC-02): 채팅 글자 크기 — 보드·클로즈업 둘 다, 행에 실린 배율 변수가 즉시 바뀌고
// 발신자·본문·시각 span의 타이포 클래스가 그 변수를 clamp 세 항에 곱해 쓴다. 인라인
// font-size로 덮어쓰지 않으므로 원래 clamp의 최소·최대 경계가 그대로 남는다.
for (const variant of ["board", "closeup"]) {
  test(`마운트된 채로 채팅 글자 크기를 낮추면 ${variant} variant의 같은 메시지 글자 배율이 즉시 줄어든다`, () => {
    useSettingsStore.setState({ chatTextSize: 100 })
    const { container } = renderRow({ variant })

    const row = container.querySelector("li")
    assert.equal(row.style.getPropertyValue(INGAME_CHAT_TEXT_SCALE_CSS_VAR), "1")

    act(() => {
      useSettingsStore.setState({ chatTextSize: 20 })
    })

    const rowAfter = container.querySelector("li")
    const scaleAfter = Number(rowAfter.style.getPropertyValue(INGAME_CHAT_TEXT_SCALE_CSS_VAR))
    assert.ok(scaleAfter < 1 && scaleAfter > 0, `배율이 줄어야 한다: ${scaleAfter}`)

    // 본문 폰트 크기는 여전히 clamp(min,선호,max) 세 항을 모두 가진 클래스가 정하고,
    // 각 항에 같은 배율 변수가 곱해져 있다(경계를 버리지 않는다).
    const bodySpan = container.querySelector("li > span:last-child")
    assert.equal(bodySpan.style.fontSize, "", "인라인 font-size로 clamp를 덮어쓰면 안 된다")
    const fontSizeUtility = bodySpan.className.match(/text-\[clamp\((.+?)\)\]\s/)
    assert.notEqual(fontSizeUtility, null, "clamp 기반 font-size 클래스가 남아 있어야 한다")
    assert.equal(
      (bodySpan.className.match(new RegExp(`var\\(${INGAME_CHAT_TEXT_SCALE_CSS_VAR},1\\)`, "g")) ?? [])
        .length,
      3,
      "clamp의 세 항 모두 배율 변수를 곱해야 한다",
    )
  })
}

test("채팅 글자 크기 기본값(100)이면 배율 1이라 기존 화면과 동일하다", () => {
  useSettingsStore.setState({ chatTextSize: null })
  const { container } = renderRow()

  const row = container.querySelector("li")
  assert.equal(row.style.getPropertyValue(INGAME_CHAT_TEXT_SCALE_CSS_VAR), "1")

  const bodySpan = container.querySelector("li > span:last-child")
  assert.equal(bodySpan.style.fontSize, "")
})

// F-15: InGameChatMessageList가 각 메시지의 sentAt을 InGameChatMessageRow로 그대로 넘긴다
// (toJokerChatUiMessage가 이미 만드는 canonical sentAt — 렌더 시점에 새로 지어내지 않는다).
// F-15(AC-04): 닉네임 색은 서버가 배정한 공개 colorIndex(themeIndex) 하나에서만 나온다 —
// 같은 참가자에게 비밀 진영(team)·직업(role)·아군 여부(isAlly)만 다르게 준 두 세션이
// 같은 색을 그려야 한다. 여기서는 세션 훅(useInGamePlayerSession)과 실제 매퍼
// (mergeSourcePlayerWithPreview)를 그대로 통과시켜, 색 생성 근거까지 포함해 검증한다.
function renderRowWithSessionPlayer(player) {
  const { result } = renderHook(() =>
    useInGamePlayerSession({ sourcePlayers: [player], playerCount: 1 }),
  )
  const session = result.current

  const view = render(
    React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: session },
      React.createElement(
        InGameChatVariantContext.Provider,
        { value: "board" },
        React.createElement(InGameChatMessageRow, {
          playerId: player.id,
          senderName: player.name,
          text: "hello",
        }),
      ),
    ),
  )

  return {
    ...view,
    senderColor: view.container.querySelector("li > span:first-child").style.color,
  }
}

const BASE_SESSION_PLAYER = {
  id: "p1",
  name: "Alice",
  connected: true,
  alive: true,
  themeIndex: 3,
}

test("비밀 진영·직업이 달라도 같은 colorIndex면 닉네임 색이 완전히 같다", () => {
  useSettingsStore.setState({ chatChecks: { "nickname-color": true } })

  const mafia = renderRowWithSessionPlayer({
    ...BASE_SESSION_PLAYER,
    role: "mafia",
    team: "mafia",
    isAlly: true,
  })
  const mafiaColor = mafia.senderColor
  mafia.unmount()

  const citizen = renderRowWithSessionPlayer({
    ...BASE_SESSION_PLAYER,
    role: "doctor",
    team: "citizen",
    isAlly: false,
  })
  const citizenColor = citizen.senderColor
  citizen.unmount()

  // 역할 정보가 아예 없는 payload(다른 참가자 시점)도 같은 색이어야 한다.
  const hidden = renderRowWithSessionPlayer({ ...BASE_SESSION_PLAYER })

  assert.equal(mafiaColor, normalizedColor(INGAME_PLAYER_THEME_PALETTE[3].color))
  assert.equal(citizenColor, mafiaColor, "진영·직업이 색을 바꾸면 비밀이 새어나간다")
  assert.equal(hidden.senderColor, mafiaColor, "역할 필드 유무가 색을 바꾸면 안 된다")
})

test("colorIndex(themeIndex)가 바뀔 때만 닉네임 색이 바뀐다", () => {
  useSettingsStore.setState({ chatChecks: { "nickname-color": true } })

  const first = renderRowWithSessionPlayer({ ...BASE_SESSION_PLAYER, themeIndex: 3 })
  const firstColor = first.senderColor
  first.unmount()

  const second = renderRowWithSessionPlayer({ ...BASE_SESSION_PLAYER, themeIndex: 5 })

  assert.equal(second.senderColor, normalizedColor(INGAME_PLAYER_THEME_PALETTE[5].color))
  assert.notEqual(second.senderColor, firstColor)
})

test("닉네임 색상을 켜도 진영·직업 값이 화면(DOM)에 노출되지 않는다", () => {
  useSettingsStore.setState({ chatChecks: { "nickname-color": true } })

  const { container } = renderRowWithSessionPlayer({
    ...BASE_SESSION_PLAYER,
    role: "mafia",
    team: "mafia",
    isAlly: true,
  })

  const markup = container.innerHTML
  for (const secret of ["mafia", "citizen", "isAlly", "role", "team"]) {
    assert.ok(!markup.includes(secret), `비밀 값이 DOM에 노출됐다: ${secret}`)
  }
})

test("InGameChatMessageList는 message.sentAt을 InGameChatMessageRow에 그대로 전달한다", () => {
  useSettingsStore.setState({ chatChecks: { "show-time": true } })
  const sentAt = new Date(2026, 0, 1, 14, 30).getTime()
  const session = { getThemeStylesByPlayerId: () => null }

  const { getByText } = render(
    React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: session },
      React.createElement(InGameChatMessageList, {
        messages: [{ id: "m1", playerId: null, senderName: "Bob", text: "hi", sentAt }],
      }),
    ),
  )

  assert.notEqual(getByText("14:30"), null)
})
