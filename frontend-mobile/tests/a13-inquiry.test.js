// 모바일 문의 시험: 너무 자주 쓰면(429) "잠시 뒤에 다시" 글, 문의 답 알림을 누르면 문의 시트가 그 문의로 열림, 제목이 비면 눌러도 안 보냄
// 목록 A13 모바일 A13-M-005·006·009·010, 합친 화면(2026-11-24 되돌림)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-inquiry.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, textOf, typeInto, waitUntil } from "./a00-kit.mjs"
import { economyRoutes, fakeSocket, renderRoute, resetGame, router, sentHttp, serve, useAuthStore } from "./a00-game.mjs"

const { default: InquirySheet } = await import("@m/domains/inquiry/InquirySheet.jsx")
const { default: LobbyPage } = await import("@m/domains/lobby/pages/LobbyPage.jsx")
const { useNotificationsStore } = await import("@/domains/notifications/store/notifications.store.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    act(() => { useAuthStore.getState().logout() })
})

const UUID = "m1-inq"
function signIn() {
    act(() => { useAuthStore.getState().login({ uuid: UUID, nickname: "가면손님" }) })
}

test("A13-M-005 모바일 문의 너무 자주: 429 → '잠시 뒤에 다시' 든 글", async () => {
    serve({
        "GET /inquiries": { status: 200, body: { ok: true, inquiries: [] } },
        "POST /inquiries": { status: 429, body: { ok: false, code: "INQUIRY_RATE_LIMITED", message: "too many" } },
    })
    signIn()
    view = await renderRoute(fakeSocket(), React.createElement(InquirySheet, { open: true, onClose: () => {} }), { path: "/lobby" })
    await flush(5)
    click(document.querySelector('[data-testid="inquiry-tab-form"]'))
    await flush()
    const bug = [...document.querySelectorAll('[role="radio"]')].find((b) => textOf(b) === "버그")
    if (bug) click(bug)
    typeInto(document.querySelector('[data-testid="inquiry-title"]'), "판이 멈춤")
    typeInto(document.querySelector('[data-testid="inquiry-body"]'), "낮에 멈췄어요")
    click(document.querySelector('[data-testid="inquiry-submit"]'))
    await flush(5)
    assert.equal(sentHttp("POST", "/inquiries").length, 1, "문의를 안 보냄")
    const message = document.querySelector('[data-testid="inquiry-message"]')
    assert.ok(message, "안내 글이 없음")
    assert.match(textOf(message), /잠시 뒤에? 다시/)
})

test("A13-M-006 모바일 문의 답 알림 탭: target inquiry 알림 '문의 답 보기' → 문의 시트가 그 문의로", async () => {
    const row = {
        id: "n4", type: "system", sourceKey: "system:n4:k", title: "문의 답", body: "답이 왔어요",
        target: { kind: "inquiry", inquiryId: 7 }, createdAt: "2026-11-16T01:00:00.000Z", readAt: "2026-11-16T02:00:00.000Z",
    }
    serve(economyRoutes(UUID))
    serve({
        "GET /user/me/profile": { status: 200, body: { success: true, data: { nickname: "가면손님" } } },
        "GET /notifications": { status: 200, body: { data: [row] } },
        "PATCH /notifications/n4/read": { status: 200, body: { data: row } },
        "GET /inquiries": { status: 200, body: { ok: true, inquiries: [] } },
        "GET /inquiries/7": { status: 200, body: { ok: true, inquiry: { id: 7, category: "BUG", title: "판이 멈춤", body: "낮에 멈췄어요", status: "ANSWERED", createdAt: "2026-11-15T01:00:00.000Z", replies: [] } } },
    })
    signIn()
    useNotificationsStore.getState().syncAccount()
    await act(async () => { await useNotificationsStore.getState().loadSnapshot() })
    view = await renderRoute(fakeSocket(), React.createElement(LobbyPage), { path: "/lobby" })
    // 로비 들어올 때 영상은 건너뜀 (사람이 누르는 건너뛰기)
    const skip = buttonNamed("인트로 건너뛰기")
    if (skip) click(skip)
    await flush(5)
    await waitUntil(() => document.querySelector('button[aria-label^="알림"]'), { label: "알림 단추" })
    click(document.querySelector('button[aria-label^="알림"]'))
    await flush(5)
    const go = buttonNamed("문의 답 보기")
    assert.ok(go, "'문의 답 보기' 단추가 없음")
    click(go)
    await waitUntil(() => document.querySelector('[data-testid="inquiry-detail"]'), { label: "문의 하나 보기" })
    assert.equal(new URLSearchParams(router.state.location.search).get("inquiryId"), "7")
    assert.equal(sentHttp("GET", "/inquiries/7").length, 1)
    assert.ok(textOf(document.querySelector('[data-testid="inquiry-detail"]')).includes("판이 멈춤"))
})

// ── 009~010: 제목이 비어도 보내기는 켜져 있고, 누르면 공용 검사가 막아 요청 안 나감 (합친 화면) ──

// 문의 쓰기 탭을 열고 종류(버그)를 고름 → 보내기 단추 (종류까지 골라야 남는 까닭이 제목 하나뿐)
async function openForm() {
    serve({
        "GET /inquiries": { status: 200, body: { ok: true, inquiries: [] } },
        "POST /inquiries": { status: 201, body: { ok: true, inquiry: { id: 9, category: "BUG", title: "판이 멈춤", body: "낮에 멈췄어요", status: "OPEN", createdAt: "2026-11-16T01:00:00.000Z" } } },
    })
    signIn()
    view = await renderRoute(fakeSocket(), React.createElement(InquirySheet, { open: true, onClose: () => {} }), { path: "/lobby" })
    await flush(5)
    click(document.querySelector('[data-testid="inquiry-tab-form"]'))
    await flush()
    click([...document.querySelectorAll('[role="radio"]')].find((b) => textOf(b) === "버그"))
    return document.querySelector('[data-testid="inquiry-submit"]')
}

test("A13-M-009 모바일 문의 제목 비움(내용만 적음) → 보내기 켜져 있음, 눌러도 요청 0 + 안내 글", async () => {
    const submit = await openForm()
    typeInto(document.querySelector('[data-testid="inquiry-body"]'), "낮에 멈췄어요")
    assert.equal(submit.disabled, false, "보내기 단추가 꺼짐")
    click(submit)
    await flush(5)
    assert.equal(sentHttp("POST", "/inquiries").length, 0)
    const message = document.querySelector('[data-testid="inquiry-message"]')
    assert.ok(message && textOf(message).length > 0, "안내 글이 없음")
})

test("A13-M-010 모바일 문의 제목 빈칸만('   ') → 눌러도 요청 0, 글자를 넣고 누르면 보내짐", async () => {
    const submit = await openForm()
    typeInto(document.querySelector('[data-testid="inquiry-title"]'), "   ")
    typeInto(document.querySelector('[data-testid="inquiry-body"]'), "낮에 멈췄어요")
    click(submit)
    await flush(5)
    assert.equal(sentHttp("POST", "/inquiries").length, 0, "빈칸 제목인데 보냄")
    typeInto(document.querySelector('[data-testid="inquiry-title"]'), "판이 멈춤")
    assert.equal(submit.disabled, false, "제목을 적었는데 보내기 단추가 꺼져 있음")
    click(submit)
    await flush(5)
    assert.equal(sentHttp("POST", "/inquiries").length, 1)
})