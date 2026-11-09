// 모바일 문의 창 시험 (AD-273): 쓰기 → 목록 답 기다림, 너무 자주(429) 안내, 알림 주소(?inquiryId=)면 그 문의 열림·닫으면 주소 id 지움, 고객센터 누르면 열림
// 서버(2-14)는 가짜 응답으로 바꿔 끼움
import { stubModule } from "../helpers/mobileLoader.mjs"
import { render, act, React } from "../helpers/dom.mjs"
import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

stubModule(
    "/frontend/src/shared/api/client.js",
    `const route = (method, path, body) => {
  globalThis.__inquiryCalls.push({ method, path, body })
  const handler = globalThis.__inquiryServer[method + " " + path]
  return handler ? handler(body) : Promise.reject(Object.assign(new Error("no route"), { status: 500 }))
}
export const api = {
  get: (path) => route("GET", path),
  post: (path, body) => route("POST", path, body),
  put: async () => { throw new Error("put 안 씀") },
  patch: async () => { throw new Error("patch 안 씀") },
  delete: async () => { throw new Error("delete 안 씀") },
}
export const apiClient = async () => { throw new Error("apiClient 안 씀") }
export const refreshAccessToken = async () => false`,
)

const { MemoryRouter, useLocation } = await import("react-router-dom")
const { INQUIRY_COPY, INQUIRY_ERROR_MESSAGES } = await import("@/domains/inquiry/api/inquiry.api.js")
const { default: MenuNav } = await import("@m/domains/lobby/components/menu/MenuNav.jsx")

const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const click = async (node) => { await act(async () => { node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })) }) }
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
// 리액트 입력칸에 글 넣기 (값 설정기를 거쳐야 onChange가 불림)
const typeInto = async (node, value) => {
    const proto = node.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    await act(async () => {
        Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value)
        node.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
}

let location = null
function LocationProbe() {
    location = useLocation()
    return null
}
const mount = (entry) => render(React.createElement(MemoryRouter, { initialEntries: [entry] },
    React.createElement(MenuNav), React.createElement(LocationProbe)))
const supportButton = () => [...document.querySelectorAll('nav[aria-label="로비 메뉴"] button')]
    .find((node) => node.querySelector('img[alt="고객센터"]'))

beforeEach(() => {
    globalThis.__inquiryCalls = []
    globalThis.__inquiryServer = { "GET /inquiries": async () => ({ ok: true, inquiries: [] }) }
})

test("AD-273 모바일: 고객센터 → 문의 창, 빈 칸이면 안 보냄, 429는 잠시 뒤 다시, 보내면 목록에 답 기다림", async () => {
    let reply = () => Promise.reject(Object.assign(new Error("x"), { status: 429, code: "INQUIRY_RATE_LIMITED" }))
    globalThis.__inquiryServer["POST /inquiries"] = (body) => reply(body)
    const view = mount("/lobby")
    assert.equal(q("inquiry-window") === null, true)
    const support = supportButton()
    assert.ok(support, "고객센터 버튼이 없음")
    assert.equal(support.tagName, "BUTTON")
    await click(support)
    await flush()
    assert.ok(q("inquiry-window"))
    assert.match(q("inquiry-list").textContent, /아직 보낸 문의가 없어요/)
    assert.equal(location.pathname, "/lobby")

    await click(q("inquiry-tab-form"))
    await click(q("inquiry-submit"))
    assert.equal(q("inquiry-message").textContent, INQUIRY_COPY.needCategory)
    assert.equal(globalThis.__inquiryCalls.filter((c) => c.method === "POST").length, 0)

    const bug = [...document.querySelectorAll('[role="radio"]')].find((node) => node.textContent === "버그")
    await click(bug)
    await typeInto(q("inquiry-title"), "밤에 멈춤")
    await typeInto(q("inquiry-body"), "투표 때 멈춰요")
    await click(q("inquiry-submit"))
    await flush()
    assert.match(q("inquiry-message").textContent, /잠시 뒤 다시/)
    assert.equal(q("inquiry-message").getAttribute("role"), "alert")

    reply = (body) => Promise.resolve({ ok: true, inquiry: { id: 5, ...body, status: "OPEN", createdAt: "2026-11-10T05:00:00.000Z", replies: [] } })
    await click(q("inquiry-submit"))
    await flush()
    assert.deepEqual(globalThis.__inquiryCalls.filter((c) => c.method === "POST").at(-1).body,
        { category: "BUG", title: "밤에 멈춤", body: "투표 때 멈춰요" })
    assert.equal(q("inquiry-notice").textContent, INQUIRY_COPY.sent)
    assert.match(q("inquiry-row-5").textContent, /답 기다림/)
    view.unmount()
})

test("AD-273 모바일 알림 누름: ?inquiryId=7이면 그 문의·운영팀 답이 열리고, 닫으면 주소 id 지움", async () => {
    globalThis.__inquiryServer["GET /inquiries/7"] = async () => ({
        ok: true,
        inquiry: {
            id: 7, category: "ACCOUNT", title: "로그인 안 됨", body: "비번이 맞는데요", status: "ANSWERED",
            createdAt: "2026-11-10T05:00:00.000Z", replies: [{ id: 1, body: "풀어 드렸어요.", createdAt: "2026-11-10T06:00:00.000Z", from: "운영팀" }],
        },
    })
    const view = mount("/lobby?inquiryId=7")
    await flush()
    await flush()
    const detail = q("inquiry-detail")
    assert.ok(detail, "문의 하나 보기가 안 열림")
    assert.match(detail.textContent, /로그인 안 됨/)
    assert.match(detail.textContent, /답함/)
    assert.match(detail.textContent, /운영팀/)
    assert.match(detail.textContent, /풀어 드렸어요/)

    const close = document.body.querySelector(`button[aria-label="${INQUIRY_COPY.closeLabel}"]`)
    await click(close)
    // 닫힘 움직임이 끝날 때까지 기다림 (요소를 assert에 그대로 넘기면 오류 글 만들다 메모리가 터짐 → 참·거짓만 봄)
    for (let i = 0; i < 50 && q("inquiry-window") !== null; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.equal(q("inquiry-window") === null, true)
    assert.equal(location.search, "")
    view.unmount()
})

test("AD-273 모바일 없는 문의(404)는 쉬운 말", async () => {
    globalThis.__inquiryServer["GET /inquiries/9"] = () => Promise.reject(Object.assign(new Error("x"), { status: 404, code: "INQUIRY_NOT_FOUND" }))
    const view = mount("/lobby?inquiryId=9")
    await flush()
    await flush()
    assert.equal(q("inquiry-detail-error").textContent, INQUIRY_ERROR_MESSAGES.INQUIRY_NOT_FOUND)
    view.unmount()
})
