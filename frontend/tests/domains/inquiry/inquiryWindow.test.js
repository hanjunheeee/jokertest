// 문의 창 시험 (AD-270~272): 쓰기 폼 빈 칸 막기·보내면 목록 답 기다림, 너무 자주(429) 안내, 알림 문의 답 누르면 그 문의 열림
// 서버(2-14)는 가짜 응답으로 바꿔 끼움
import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true })
for (const [name, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))
mock.module("../../../src/shared/env.js", { namedExports: { API_BASE_URL: "", DISCORD_SUPPORT_URL: undefined } })

// 가짜 서버: 경로별 답을 시험마다 갈아끼움
const calls = []
let server = {}
const route = (method, path, body) => {
  calls.push({ method, path, body })
  const handler = server[`${method} ${path}`]
  return handler ? handler(body) : Promise.reject(Object.assign(new Error("no route"), { status: 500 }))
}
mock.module("../../../src/shared/api/client.js", {
  namedExports: {
    api: {
      get: (path) => route("GET", path),
      post: (path, body) => route("POST", path, body),
      put: async () => { throw new Error("put 안 씀") },
      patch: async () => { throw new Error("patch 안 씀") },
      delete: async () => { throw new Error("delete 안 씀") },
    },
    apiClient: async () => { throw new Error("apiClient 안 씀") },
    refreshAccessToken: async () => false,
  },
})

const { INQUIRY_COPY, INQUIRY_ERROR_MESSAGES, validateInquiryForm } = await import("../../../src/domains/inquiry/api/inquiry.api.js")
const { buildNotificationTargetPath, notificationTargetLabel } = await import("../../../src/shared/constants/notificationTargets.js")
const { default: InquiryWindow } = await import("../../../src/domains/inquiry/components/InquiryWindow.jsx")
const { default: LobbyMenuNav } = await import("../../../src/domains/lobby/components/LobbyMenuNav.jsx")
const { render, act, cleanup, fireEvent, waitFor } = await import("@testing-library/react")
const { MemoryRouter, useLocation } = await import("react-router-dom")

const apiError = (status, code) => Object.assign(new Error(code), { status, code, ok: false })
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

test.beforeEach(() => {
  calls.length = 0
  server = { "GET /inquiries": async () => ({ ok: true, inquiries: [] }) }
})
test.afterEach(() => cleanup())

// 쓰기 칸 채우기
async function fillForm({ category = "버그", title = "", body = "" } = {}) {
  const radio = [...document.body.querySelectorAll('[role="radio"]')].find((node) => node.textContent === category)
  if (radio) await act(async () => { fireEvent.click(radio) })
  await act(async () => { fireEvent.change(q("inquiry-title"), { target: { value: title } }) })
  await act(async () => { fireEvent.change(q("inquiry-body"), { target: { value: body } }) })
}

test("AD-270 입력 검사: 종류·제목·내용 다 있어야 통과, 길이 끝 넘으면 안내", () => {
  assert.equal(validateInquiryForm({ category: null, title: "a", body: "b" }), INQUIRY_COPY.needCategory)
  assert.equal(validateInquiryForm({ category: "BUG", title: "  ", body: "b" }), INQUIRY_COPY.needTitle)
  assert.equal(validateInquiryForm({ category: "BUG", title: "a", body: " " }), INQUIRY_COPY.needBody)
  assert.equal(validateInquiryForm({ category: "BUG", title: "x".repeat(101), body: "b" }), INQUIRY_COPY.titleTooLong)
  assert.equal(validateInquiryForm({ category: "ETC", title: "a", body: "x".repeat(2001) }), INQUIRY_COPY.bodyTooLong)
  assert.equal(validateInquiryForm({ category: "ACCOUNT", title: "a", body: "b" }), null)
})

test("AD-270 데스크톱 쓰기 폼: 빈 칸이면 안 보냄, 보내면 내 문의 목록에 답 기다림으로 보임", async () => {
  server["POST /inquiries"] = async (body) => ({
    ok: true,
    inquiry: { id: 41, ...body, status: "OPEN", createdAt: "2026-11-10T05:00:00.000Z", replies: [] },
  })
  render(React.createElement(InquiryWindow, { open: true, targetId: null, onClose: () => {} }))
  await flush()
  assert.match(q("inquiry-list").textContent, /아직 보낸 문의가 없어요/)

  await act(async () => { fireEvent.click(q("inquiry-tab-form")) })
  await act(async () => { fireEvent.click(q("inquiry-submit")) })
  assert.equal(q("inquiry-message").textContent, INQUIRY_COPY.needCategory)
  assert.equal(calls.filter((c) => c.method === "POST").length, 0)

  await fillForm({ category: "버그", title: "  밤에 멈춤 ", body: " 투표 때 화면이 멈춰요 " })
  await act(async () => { fireEvent.click(q("inquiry-submit")) })
  await flush()
  const posts = calls.filter((c) => c.method === "POST")
  assert.equal(posts.length, 1)
  assert.deepEqual(posts[0].body, { category: "BUG", title: "밤에 멈춤", body: "투표 때 화면이 멈춰요" })
  assert.equal(q("inquiry-notice").textContent, INQUIRY_COPY.sent)
  const row = q("inquiry-row-41")
  assert.ok(row, "보낸 문의가 목록에 없음")
  assert.match(row.textContent, /밤에 멈춤/)
  assert.match(row.textContent, /답 기다림/)
})

test("AD-271 데스크톱 너무 자주(429) → 잠시 뒤 다시 안내, 쓴 글은 그대로, 답 기다림 5개(409)도 쉬운 말", async () => {
  let reply = () => Promise.reject(apiError(429, "INQUIRY_RATE_LIMITED"))
  server["POST /inquiries"] = () => reply()
  render(React.createElement(InquiryWindow, { open: true, targetId: null, onClose: () => {} }))
  await flush()
  await act(async () => { fireEvent.click(q("inquiry-tab-form")) })
  await fillForm({ category: "계정", title: "로그인", body: "안 돼요" })
  await act(async () => { fireEvent.click(q("inquiry-submit")) })
  await flush()
  const message = q("inquiry-message")
  assert.match(message.textContent, /잠시 뒤 다시/)
  assert.equal(message.getAttribute("role"), "alert")
  assert.equal(q("inquiry-title").value, "로그인")

  reply = () => Promise.reject(apiError(409, "INQUIRY_OPEN_LIMIT"))
  await act(async () => { fireEvent.click(q("inquiry-submit")) })
  await flush()
  assert.equal(q("inquiry-message").textContent, INQUIRY_ERROR_MESSAGES.INQUIRY_OPEN_LIMIT)
  // 코드 없이 429만 와도 같은 안내
  reply = () => Promise.reject(Object.assign(new Error("x"), { status: 429 }))
  await act(async () => { fireEvent.click(q("inquiry-submit")) })
  await flush()
  assert.match(q("inquiry-message").textContent, /잠시 뒤 다시/)
})

test("AD-272 알림 대상 inquiry → 로비 주소·버튼 글자, 이상한 id면 안 감", () => {
  assert.equal(buildNotificationTargetPath({ kind: "inquiry", inquiryId: 7 }), "/lobby?inquiryId=7")
  assert.equal(buildNotificationTargetPath({ kind: "inquiry", inquiryId: "12" }), "/lobby?inquiryId=12")
  assert.equal(buildNotificationTargetPath({ kind: "inquiry", inquiryId: 0 }), null)
  assert.equal(buildNotificationTargetPath({ kind: "inquiry", inquiryId: "1&x=2" }), null)
  assert.equal(notificationTargetLabel({ kind: "inquiry", inquiryId: 7 }), "문의 답 보기")
})

let currentLocation = null
function LocationProbe() {
  currentLocation = useLocation()
  return null
}
const mountMenu = (entry) => render(React.createElement(MemoryRouter, { initialEntries: [entry] },
  React.createElement(LobbyMenuNav), React.createElement(LocationProbe)))

test("AD-272 알림에서 온 주소(?inquiryId=7)면 문의 창이 그 문의를 열고 답은 운영팀, 닫으면 주소 id 지움", async () => {
  server["GET /inquiries/7"] = async () => ({
    ok: true,
    inquiry: {
      id: 7, category: "BUG", title: "밤에 멈춤", body: "투표 때 멈춰요", status: "ANSWERED",
      createdAt: "2026-11-10T05:00:00.000Z", answeredAt: "2026-11-10T06:00:00.000Z",
      replies: [{ id: 3, body: "고쳤어요. 다시 해 보세요.", createdAt: "2026-11-10T06:00:00.000Z", from: "운영팀" }],
    },
  })
  mountMenu("/lobby?inquiryId=7")
  await waitFor(() => assert.ok(q("inquiry-detail")))
  await flush()
  const detail = q("inquiry-detail")
  assert.match(detail.textContent, /밤에 멈춤/)
  assert.match(detail.textContent, /답함/)
  assert.match(detail.textContent, /운영팀/)
  assert.match(detail.textContent, /고쳤어요/)
  assert.ok(calls.some((c) => c.path === "/inquiries/7"))

  await act(async () => { fireEvent.click(document.body.querySelector(`[aria-label="${INQUIRY_COPY.closeLabel}"]`)) })
  assert.equal(q("inquiry-window"), null)
  assert.equal(currentLocation.search, "")
})

test("AD-272 없는 문의(404)는 쉬운 말 안내", async () => {
  server["GET /inquiries/9"] = () => Promise.reject(apiError(404, "INQUIRY_NOT_FOUND"))
  mountMenu("/lobby?inquiryId=9")
  await flush()
  await flush()
  assert.equal(q("inquiry-detail-error").textContent, INQUIRY_ERROR_MESSAGES.INQUIRY_NOT_FOUND)
})

test("로비 고객센터 버튼 → 문의 창(내 문의), 경로는 그대로", async () => {
  mountMenu("/lobby")
  assert.equal(q("inquiry-window"), null)
  const support = document.body.querySelector('nav[aria-label="로비 메뉴"] [aria-label="고객센터"]')
  assert.equal(support.tagName, "BUTTON")
  assert.equal(support.disabled, false)
  await act(async () => { fireEvent.click(support) })
  await flush()
  assert.ok(q("inquiry-window"))
  assert.ok(q("inquiry-list"))
  assert.equal(currentLocation.pathname, "/lobby")
})
