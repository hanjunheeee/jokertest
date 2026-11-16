// 알림 창 부품 시험 (알림 줄·갈 곳 단추·업적/문의/설정으로 가기·받기 실패·처리 중·읽은 메시지 삭제·포커스 돌아감·배지)
// 목록 A13-F-220~229 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/notification-modal.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, act } = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider, useNavigate } = await import("react-router-dom")
const { useNotificationsStore } = await import("../../src/domains/notifications/store/notifications.store.js")
const { useSettingsStore } = await import("../../src/domains/settings/store/settingsStore.js")
const { default: NotificationModal } = await import("../../src/domains/notifications/components/NotificationModal.js")
const { default: NotificationItem } = await import("../../src/domains/notifications/components/modal/NotificationItem.js")
const { default: NotificationEntryButton } = await import("../../src/domains/notifications/components/NotificationEntryButton.js")
const { default: LobbyMenuNav } = await import("../../src/domains/lobby/components/LobbyMenuNav.jsx")
const { installFetch, signIn, resetAll, settle, note, press, HOLD } = await import("./a13Kit.mjs")

const h = React.createElement
test.afterEach(() => resetAll())

const store = () => useNotificationsStore.getState()
// 읽음 답: 그 알림을 읽음 시각과 함께 돌려줌
const readAnswer = (row) => ({ body: { data: { ...row, readAt: "2026-11-16T03:00:00.000Z" } } })

// 서버 목록을 받아 둔 상태 (rows), 알림 창은 아직 안 그림
async function loaded(rows, routes = {}) {
  signIn()
  const http = installFetch({ "GET /notifications": { body: { data: rows } }, ...routes })
  store().syncAccount()
  await act(async () => { await store().loadSnapshot() })
  return http
}

// 알림 창 그리기 (열린 채)
async function openModal() {
  await act(async () => { render(h(NotificationModal, { open: true, onClose: () => {} })); await settle() })
}

// 로비 주소에 알림 창 + 로비 메뉴(문의 창)를 두고, 알림의 갈 곳 누르면 그 주소로 이동하는 작은 앱
function LobbyStub() {
  const navigate = useNavigate()
  return h(React.Fragment, null, h(LobbyMenuNav), h(NotificationModal, { open: true, onClose: () => {}, onNavigate: navigate }))
}
async function openInApp() {
  const router = createMemoryRouter([
    { path: "/lobby", element: h(LobbyStub) },
    { path: "/library", element: h("p", null, "기억의 서고 화면") },
    { path: "/setting", element: h("p", null, "환경설정 화면") },
  ], { initialEntries: ["/lobby"] })
  await act(async () => { render(h(RouterProvider, { router })); await settle(8) })
  return router
}

test("A13-F-220 알림 1개 → 제목·본문·시각, 안 읽은 표시", async () => {
  const item = note("n1", { title: "새 친구 요청", body: "민수 님이 친구 요청을 보냈습니다." })
  render(h("ul", null, h(NotificationItem, { item, pending: false, error: null, onRead() {}, onOpenTarget() {}, onClearError() {} })))
  const row = document.querySelector('[data-notification-id="n1"]')
  assert.match(row.textContent, /새 친구 요청/)
  assert.match(row.textContent, /민수 님이 친구 요청을 보냈습니다\./)
  assert.equal(row.getAttribute("data-notification-read"), "false")
  // 시각: 받은 때(createdAt)가 글이나 time 칸으로 보여야 함
  assert.ok(row.querySelector("time") || /\d{1,2}:\d{2}/.test(row.textContent), "알림 줄에 시각이 안 보임")
})

// 갈 곳 이름이 없는데 갈 주소만 있는 경우는 안 생김 (주소를 아는 종류는 전부 이름도 있음) → 모르는 종류면 단추가 없는지 봄
test("A13-F-221 모르는 종류의 target(kind: event) → 갈 곳 단추 없음, 제목·본문은 그대로", async () => {
  const item = note("n2", { target: { kind: "event", eventId: "e-1" } })
  render(h("ul", null, h(NotificationItem, { item, pending: false, error: null, onRead() {}, onOpenTarget() {}, onClearError() {} })))
  const row = document.querySelector('[data-notification-id="n2"]')
  assert.equal(row.querySelectorAll("button").length, 0)
  assert.match(row.textContent, /제목 n2/)
  assert.match(row.textContent, /본문 n2/)
})

test("A13-F-222 업적 알림 단추 → 기억의 서고 화면으로", async () => {
  const row = note("n3", { type: "achievement", read: true, target: { kind: "achievement", achievementId: "ach-1" } })
  await loaded([row], { "PATCH /notifications/n3/read": readAnswer(row) })
  const router = await openInApp()
  await press(screen.getByRole("button", { name: "기억의 서고에서 보기" }))
  assert.equal(router.state.location.pathname, "/library")
  assert.ok(screen.getByText("기억의 서고 화면"))
})

test("A13-F-223 문의 답 알림 { kind: inquiry, inquiryId } → 문의 창이 그 문의로 열림", async () => {
  const row = note("n4", { type: "system", read: true, target: { kind: "inquiry", inquiryId: 7 } })
  const http = await loaded([row], {
    "PATCH /notifications/n4/read": readAnswer(row),
    "GET /inquiries": { body: { ok: true, inquiries: [] } },
    "GET /inquiries/7": { body: { ok: true, inquiry: { id: 7, category: "BUG", title: "판이 멈춤", body: "낮에 멈췄어요", status: "ANSWERED", createdAt: "2026-11-15T01:00:00.000Z", replies: [] } } },
  })
  await openInApp()
  await press(screen.getByRole("button", { name: "문의 답 보기" }))
  assert.ok(screen.getByRole("dialog", { name: "고객센터 문의" }))
  assert.equal(http.to("GET", "/inquiries/7").length, 1)
  assert.ok(screen.getByText("판이 멈춤"))
})

test("A13-F-224 환영 안내 { kind: settings } → 환경설정 열림", async () => {
  const row = note("n5", { type: "system", read: true, target: { kind: "settings" } })
  await loaded([row], { "PATCH /notifications/n5/read": readAnswer(row) })
  const router = await openInApp()
  await press(screen.getByRole("button", { name: "환경설정 열기" }))
  assert.equal(router.state.location.pathname, "/setting")
})

test("A13-F-225 알림 받기 실패 → \"알림을 불러오지 못했습니다.\" alert + \"다시 시도\", 누르면 목록 요청 1번", async () => {
  const http = await loaded([], { "GET /notifications": { status: 500, body: {} } })
  await openModal()
  const before = http.to("GET", "/notifications").length
  const alert = screen.getByRole("alert")
  await press(screen.getByRole("button", { name: "다시 시도" }))
  assert.equal(http.to("GET", "/notifications").length - before, 1)
  assert.equal(alert.textContent, "알림을 불러오지 못했습니다.")
})

test("A13-F-226 갈 곳 처리 중 → 글 \"처리 중…\", 읽기 이름 \"처리 중\", 꺼짐", async () => {
  const row = note("n6", { type: "achievement", read: true, target: { kind: "achievement", achievementId: "ach-2" } })
  const http = await loaded([row], { "PATCH /notifications/n6/read": HOLD })
  await openModal()
  await press(screen.getByRole("button", { name: "기억의 서고에서 보기" }))
  const button = screen.getByRole("button", { name: "처리 중" })
  assert.equal(button.textContent, "처리 중…")
  assert.equal(button.disabled, true)
  await http.release("PATCH", "/notifications/n6/read", readAnswer(row))
})

test("A13-F-227 \"읽은 메시지 삭제\" → DELETE /notifications/read 1번, 성공 뒤 읽은 줄 없음", async () => {
  const http = await loaded([note("r1", { read: true }), note("r2", { read: true })], {
    "DELETE /notifications/read": { body: { data: { deletedCount: 2 } } },
  })
  await openModal()
  await press(screen.getByRole("button", { name: "읽은 메시지 삭제" }))
  assert.equal(http.to("DELETE", "/notifications/read").length, 1)
  assert.equal(document.querySelectorAll("[data-notification-id]").length, 0)
})

// 알림 단추 + 알림 창 (열고 닫기는 스토어가 맡음, 로비와 같음)
function EntryAndModal() {
  const open = useNotificationsStore((s) => s.open)
  return h(React.Fragment, null,
    h(NotificationEntryButton, { open, onOpen: () => store().openModal() }),
    h(NotificationModal, { open, onClose: () => store().closeModal() }))
}

test("A13-F-228 알림 단추로 열기 → 닫기 → 포커스가 알림 단추로", async () => {
  await loaded([])
  await act(async () => { render(h(EntryAndModal)); await settle() })
  const entry = document.querySelector("[data-notification-entry]")
  entry.focus()
  await press(entry)
  assert.ok(document.querySelector("[data-notification-modal]"), "창이 안 열림")
  await press(screen.getByRole("button", { name: "닫기" }))
  assert.equal(document.querySelector("[data-notification-modal]"), null)
  assert.ok(document.activeElement === entry, "포커스가 알림 단추로 안 돌아감")
})

test("A13-F-229 안 읽음 3(끈 종류 1) → 알림 단추 배지 2", async () => {
  await loaded([note("a", { type: "system" }), note("b", { type: "game-invite" }), note("c", { type: "friend-request" })])
  useSettingsStore.getState().setGeneralCheck("friend-invite", false)
  await act(async () => { render(h(NotificationEntryButton, { onOpen() {} })); await settle() })
  const entry = document.querySelector("[data-notification-entry]")
  assert.equal(entry.querySelector('span[aria-hidden="true"]')?.textContent, "2")
  assert.equal(entry.getAttribute("aria-label"), "알림 (읽지 않음 2개)")
})
