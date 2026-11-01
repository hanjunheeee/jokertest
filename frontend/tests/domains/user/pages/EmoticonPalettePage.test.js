import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "", DISCORD_SUPPORT_URL: undefined },
})

const json = (status, body) => {
  const response = { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } }
  response.clone = () => response
  return response
}

let handleRequest = async () => { throw new Error("fetch handler stub not set") }
let calls = []
installDomGlobal("fetch", async (url, options = {}) => {
  const method = options.method ?? "GET"
  const body = options.body ? JSON.parse(options.body) : undefined
  calls.push({ method, url, body })
  return await handleRequest({ method, url, body })
})

const unhandled = []
process.on("unhandledRejection", (reason) => { unhandled.push(reason) })
const flushMicrotasks = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve() }

const { render, act, cleanup, waitFor, fireEvent } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { default: EmoticonPalettePage } = await import("../../../../src/domains/user/pages/EmoticonPalettePage.jsx")
const { useEmojiPaletteStore } = await import("../../../../src/domains/user/store/emojiPalette.store.js")

const DEFAULT_SLOTS = [
  "emoji-basic-reject", "emoji-basic-tears", "emoji-basic-anger", "emoji-basic-love",
  "emoji-basic-grin", "emoji-basic-hello", "emoji-basic-surrender", "emoji-basic-dizzy",
]
const DEFAULT_NAMES = ["거절", "눈물", "분노", "사랑", "씨익", "안녕", "항복", "헤롱"]
const OWNED = [...DEFAULT_SLOTS, "emoji-startled"]

const putCalls = () => calls.filter((call) => call.method === "PUT")

const newWorld = () => {
  calls = []
  unhandled.length = 0
  handleRequest = async () => { throw new Error("fetch handler stub not set") }
  useEmojiPaletteStore.getState().reset()
}

const routeGet = (body, status = 200) => {
  handleRequest = async ({ method }) => {
    if (method === "GET") return json(status, body)
    throw new Error(`unexpected ${method}`)
  }
}

const mountPage = async () => {
  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/mypage/emoticons"] },
      React.createElement(EmoticonPalettePage)))
  })
  return view
}

const mountReady = async ({ slots = DEFAULT_SLOTS, revision = "r1", owned = OWNED } = {}) => {
  routeGet({ ok: true, slots, revision, owned })
  const view = await mountPage()
  await waitFor(() => assert.equal(useEmojiPaletteStore.getState().status, "ready"))
  return view
}

const slotButton = (view, oneBased) => view.getByRole("button", { name: `${oneBased}번 슬롯` })
const slotContent = (view, oneBased) => {
  const image = slotButton(view, oneBased).querySelector("img")
  return image ? image.getAttribute("alt") : slotButton(view, oneBased).textContent
}
const listButton = (view, name) => view.queryByRole("button", { name: `${name} 팔레트에 넣기` })
const click = (view, element) => act(async () => { fireEvent.click(element) })

test.afterEach(() => cleanup())

test("AC-09: 팔레트 슬롯을 고른 뒤 왼쪽 목록 항목을 클릭하면 그 슬롯이 새 이모티콘으로 바뀐다", async () => {
  newWorld()
  const view = await mountReady()

  for (let index = 0; index < 8; index += 1) {
    assert.equal(slotContent(view, index + 1), DEFAULT_NAMES[index])
  }

  await click(view, slotButton(view, 1))
  assert.equal(slotButton(view, 1).getAttribute("aria-pressed"), "true", "고른 슬롯이 표시되어야 한다")

  await click(view, listButton(view, "깜짝"))

  assert.equal(slotContent(view, 1), "깜짝", "고른 슬롯이 새 이모티콘으로 교체되어야 한다")
  assert.equal(putCalls().length, 0, "저장 전에는 서버에 보내지 않는다")
})

test("AC-10: 저장 버튼을 누르면 PUT 본문이 {slots, expectedRevision} 형태로 전송된다", async () => {
  newWorld()
  const view = await mountReady()

  await click(view, slotButton(view, 1))
  await click(view, listButton(view, "깜짝"))

  handleRequest = async ({ method, body }) => {
    if (method !== "PUT") throw new Error(`unexpected ${method}`)
    return json(200, { ok: true, slots: body.slots, revision: "r2" })
  }
  await click(view, view.getByRole("button", { name: "저장" }))
  await waitFor(() => assert.equal(putCalls().length, 1))

  const sent = putCalls()[0]
  assert.match(sent.url, /\/user\/me\/emoji-palette$/)
  assert.deepEqual(Object.keys(sent.body).sort(), ["expectedRevision", "slots"])
  assert.equal(sent.body.expectedRevision, "r1")
  assert.equal(sent.body.slots.length, 8)
  assert.equal(sent.body.slots[0], "emoji-startled")
  await waitFor(() => assert.equal(useEmojiPaletteStore.getState().revision, "r2"))
})

test("AC-11: 취소 버튼을 누르면 서버에서 마지막으로 불러온 팔레트로 복원된다", async () => {
  newWorld()
  const view = await mountReady()

  await click(view, slotButton(view, 1))
  await click(view, listButton(view, "깜짝"))
  assert.equal(slotContent(view, 1), "깜짝")

  await click(view, view.getByRole("button", { name: "취소" }))

  for (let index = 0; index < 8; index += 1) {
    assert.equal(slotContent(view, index + 1), DEFAULT_NAMES[index], "취소는 서버 값으로 되돌린다")
  }
  assert.equal(putCalls().length, 0, "취소는 서버에 아무 것도 보내지 않는다")
})

test("AC-12: 소유하지 않은 이모티콘은 목록에 어둡게 표시되며 선택할 수 없다", async () => {
  newWorld()
  const view = await mountReady()

  for (const name of [...DEFAULT_NAMES, "깜짝"]) {
    assert.ok(listButton(view, name), `${name}은 보유 목록에 있어야 한다`)
  }

  const unownedButton = view.getByRole("button", { name: "정조준 (미보유)" })
  assert.ok(unownedButton, "미보유 이모티콘도 목록에 표시되어야 한다")
  assert.equal(unownedButton.disabled, true, "미보유 이모티콘은 선택할 수 없어야 한다")
})

test("AC-12: 검색어와 등급 드롭다운은 카탈로그 전체를 좁힌다(미보유도 필터 결과에 포함된다)", async () => {
  newWorld()
  const view = await mountReady()

  await act(async () => {
    fireEvent.change(view.getByLabelText("이모티콘 검색"), { target: { value: "분" } })
  })
  assert.ok(listButton(view, "분노"))
  assert.equal(listButton(view, "거절"), null)

  await act(async () => {
    fireEvent.change(view.getByLabelText("이모티콘 검색"), { target: { value: "" } })
    fireEvent.change(view.getByLabelText("이모티콘 등급 필터"), { target: { value: "상점" } })
  })
  assert.ok(listButton(view, "깜짝"), "보유한 상점 이모티콘이 남는다")
  assert.equal(listButton(view, "거절"), null)
  assert.ok(view.getByRole("button", { name: "정조준 (미보유)" }), "미보유 상점 이모티콘도 등급 필터 결과에 포함된다")
})

test("초기화에 실패하면 에러 문구·다시 시도 버튼이 보이고 편집·저장이 막히며 처리되지 않은 rejection도 없다", async () => {
  newWorld()
  handleRequest = async () => { throw new TypeError("network down") }

  const view = await mountPage()
  await waitFor(() => assert.equal(useEmojiPaletteStore.getState().status, "error"))
  await flushMicrotasks()

  assert.match(view.container.textContent, /이모티콘 팔레트를 불러오지 못했습니다/)
  const retry = view.getByRole("button", { name: "다시 시도" })
  assert.ok(retry)
  assert.deepEqual(unhandled, [], "진입 효과의 거부가 처리되지 않은 채로 남으면 안 된다")

  assert.equal(slotButton(view, 1).disabled, true)
  assert.equal(view.getByRole("button", { name: "저장" }).disabled, true)
  await click(view, slotButton(view, 1))
  await click(view, view.getByRole("button", { name: "저장" }))
  assert.equal(putCalls().length, 0, "불러오지 못한 상태에서는 저장 요청이 나가면 안 된다")

  routeGet({ ok: true, slots: DEFAULT_SLOTS, revision: "r1", owned: OWNED })
  await click(view, retry)
  await waitFor(() => assert.equal(useEmojiPaletteStore.getState().status, "ready"))
  assert.equal(slotContent(view, 1), "거절")
})

test("AC-03(화면): 저장이 409 REVISION_MISMATCH로 거부되면 팔레트가 서버의 현재 값으로 다시 그려지고 충돌 안내가 보인다", async () => {
  newWorld()
  const view = await mountReady()

  await click(view, slotButton(view, 1))
  await click(view, listButton(view, "깜짝"))

  const serverSlots = [...DEFAULT_SLOTS].reverse()
  handleRequest = async ({ method }) => {
    if (method !== "PUT") throw new Error(`unexpected ${method}`)
    return json(409, { ok: false, code: "REVISION_MISMATCH", message: "충돌", revision: "r2", slots: serverSlots })
  }
  await click(view, view.getByRole("button", { name: "저장" }))
  await waitFor(() => assert.ok(useEmojiPaletteStore.getState().conflict))

  const serverNames = [...DEFAULT_NAMES].reverse()
  for (let index = 0; index < 8; index += 1) {
    assert.equal(slotContent(view, index + 1), serverNames[index], "충돌 뒤에는 서버의 현재 팔레트가 보여야 한다")
  }
  assert.match(view.container.textContent, /다른 곳에서 먼저 변경/)
})

test("저장이 NOT_OWNED로 거부되면 안내만 보이고 팔레트는 그대로다", async () => {
  newWorld()
  const view = await mountReady()

  handleRequest = async () => json(400, { ok: false, code: "NOT_OWNED", message: "미소유" })
  await click(view, view.getByRole("button", { name: "저장" }))
  await waitFor(() => assert.match(view.container.textContent, /보유하지 않은 이모티콘/))

  for (let index = 0; index < 8; index += 1) {
    assert.equal(slotContent(view, index + 1), DEFAULT_NAMES[index])
  }
  assert.doesNotMatch(view.container.textContent, /다른 곳에서 먼저 변경/)
})

test("카탈로그에 없는 itemId가 섞여 와도 예외 없이 그려지고, 목록에는 빠지며 그 슬롯은 빈 칸이 된다", async () => {
  newWorld()
  const slots = [...DEFAULT_SLOTS]
  slots[3] = "emoji-unknown-xyz"

  const view = await mountReady({ slots, owned: [...OWNED, "emoji-unknown-xyz"] })

  assert.equal(listButton(view, "emoji-unknown-xyz"), null)
  assert.doesNotMatch(view.container.textContent, /emoji-unknown-xyz/)
  assert.equal(slotButton(view, 4).querySelector("img"), null, "알 수 없는 itemId의 아이콘에 손대면 안 된다")
  assert.match(slotContent(view, 4), /비어 있음/)
  assert.equal(slotContent(view, 1), "거절")
})
