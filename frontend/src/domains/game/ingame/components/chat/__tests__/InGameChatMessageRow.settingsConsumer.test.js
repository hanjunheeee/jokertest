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

const { render, cleanup, act } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { default: InGameChatMessageRow } = await import("../InGameChatMessageRow.jsx")
const { default: InGameChatMessageList } = await import("../InGameChatMessageList.jsx")
const { InGameChatVariantContext } = await import("../InGameChatVariantContext.jsx")
const { InGamePlayerSessionContext } = await import("../../InGamePlayerSessionContext.js")
const { useSettingsStore } = await import("../../../../../settings/store/settingsStore.js")
const { resolveInGamePlayerThemeByColorIndex } = await import(
  "../../../constants/ingamePlayerTheme.js"
)

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

// F-15(AC-02): 채팅 글자 크기 — 보드·클로즈업 둘 다 실제 렌더된 폰트 크기가 바뀐다.
for (const variant of ["board", "closeup"]) {
  test(`마운트된 채로 채팅 글자 크기를 낮추면 ${variant} variant의 같은 메시지 폰트 크기가 즉시 줄어든다`, () => {
    useSettingsStore.setState({ chatTextSize: 100 })
    const { container } = renderRow({ variant })

    const bodySpan = container.querySelector("li > span:last-child")
    const beforeFontSize = bodySpan.style.fontSize

    act(() => {
      useSettingsStore.setState({ chatTextSize: 20 })
    })

    const bodySpanAfter = container.querySelector("li > span:last-child")
    assert.notEqual(bodySpanAfter.style.fontSize, beforeFontSize)
    assert.match(bodySpanAfter.style.fontSize, /^[\d.]+cqi$/)
  })
}

test("채팅 글자 크기 기본값(100)이면 인라인 폰트 크기를 얹지 않는다(기존 화면과 동일)", () => {
  useSettingsStore.setState({ chatTextSize: null })
  const { container } = renderRow()

  const bodySpan = container.querySelector("li > span:last-child")
  assert.equal(bodySpan.style.fontSize, "")
})

// F-15: InGameChatMessageList가 각 메시지의 sentAt을 InGameChatMessageRow로 그대로 넘긴다
// (toJokerChatUiMessage가 이미 만드는 canonical sentAt — 렌더 시점에 새로 지어내지 않는다).
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
