// 알림 상태 시험 (설정에서 끈 종류 숨김·안 읽은 수·창 본문 상태·지우기 실패 되돌림·자동 읽음·읽은 메시지 삭제 켜짐)
// 목록 A13-F-031~045 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/notification-state.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, act } = await import("@testing-library/react")
const { useNotificationsStore, selectVisibleNotifications, selectUnreadCount } = await import("../../src/domains/notifications/store/notifications.store.js")
const { resolveBodyState } = await import("../../src/domains/notifications/utils/visibleNotifications.js")
const { useSettingsStore } = await import("../../src/domains/settings/store/settingsStore.js")
const { default: NotificationModal } = await import("../../src/domains/notifications/components/NotificationModal.js")
const { installFetch, signIn, resetAll, settle, note, ME, HOLD } = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

const store = () => useNotificationsStore.getState()
const checks = () => useSettingsStore.getState().generalChecks
const visibleIds = () => selectVisibleNotifications(store().items, checks()).map((n) => n.id)

// 서버 목록을 받아 둔 상태로 시작 (목록 = rows)
async function loaded(rows, routes = {}) {
  signIn()
  const http = installFetch({ "GET /notifications": { body: { data: rows } }, ...routes })
  store().syncAccount()
  await act(async () => { await store().loadSnapshot() })
  return http
}

// 네 종류 알림 하나씩 (안 읽음)
const FOUR = [
  note("fr", { type: "friend-request" }),
  note("gi", { type: "game-invite" }),
  note("ac", { type: "achievement" }),
  note("sy", { type: "system" }),
]

test("A13-F-031 친구 초대 설정 끔 → 친구 신청 알림이 목록에서 빠짐", async () => {
  await loaded(FOUR)
  useSettingsStore.getState().setGeneralCheck("friend-invite", false)
  assert.deepEqual(visibleIds().sort(), ["ac", "gi", "sy"])
})

test("A13-F-032 게임 초대 설정 끔 → 게임 초대 알림이 목록에서 빠짐", async () => {
  await loaded(FOUR)
  useSettingsStore.getState().setGeneralCheck("game-invite", false)
  assert.equal(visibleIds().includes("gi"), false)
  assert.equal(visibleIds().length, 3)
})

test("A13-F-033 시스템 알림 설정 끔 → 업적 알림이 목록에서 빠짐", async () => {
  await loaded(FOUR)
  useSettingsStore.getState().setGeneralCheck("system-notification", false)
  assert.equal(visibleIds().includes("ac"), false)
})

test("A13-F-034 시스템 알림 설정 끔 → 시스템 알림이 목록에서 빠짐", async () => {
  await loaded(FOUR)
  useSettingsStore.getState().setGeneralCheck("system-notification", false)
  assert.equal(visibleIds().includes("sy"), false)
})

test("A13-F-035 안 읽음 3(그중 1은 끈 종류) → 안 읽은 수 2", async () => {
  await loaded([note("a", { type: "system" }), note("b", { type: "game-invite" }), note("c", { type: "friend-request" })])
  useSettingsStore.getState().setGeneralCheck("friend-invite", false)
  assert.equal(selectUnreadCount(store().items, checks()), 2)
})

test("A13-F-036 알림 창 본문: 받기 실패 → 오류", () => {
  assert.equal(resolveBodyState("error", 0), "error")
})

test("A13-F-037 알림 창 본문: 아직 안 받음 → 불러오는 중", () => {
  assert.equal(resolveBodyState("idle", 0), "loading")
})

test("A13-F-038 알림 창 본문: 0개 → 빈", () => {
  assert.equal(resolveBodyState("success", 0), "empty")
})

test("A13-F-039 알림 창 본문: 1개 이상 → 목록", () => {
  assert.equal(resolveBodyState("success", 1), "list")
})

test("A13-F-040 읽은 2개 지우기 → 그사이 새 알림 1 → 지우기 실패 → 목록 = 읽은 2 + 새 1", async () => {
  const http = await loaded([note("r1", { read: true }), note("r2", { read: true })], { "DELETE /notifications/read": HOLD })
  let pending
  await act(async () => { pending = store().deleteReadNotifications(); await settle() })
  assert.equal(store().items.length, 0)
  store().receiveLiveNotification(ME, note("n3"))
  await http.release("DELETE", "/notifications/read", { status: 500, body: { message: "지우기 실패" } })
  await act(async () => { await pending })
  assert.deepEqual(store().items.map((n) => n.id).sort(), ["n3", "r1", "r2"])
})

test("A13-F-041 자동 읽음 보냄 → 그 알림 지워짐 → 답 옴 → 지운 알림 안 되살아남", async () => {
  const http = await loaded([note("u1")], { "PATCH /notifications/u1/read": HOLD, "DELETE /notifications/read": { body: { data: { deletedCount: 1 } } } })
  let marking
  await act(async () => { marking = store().markVisibleUnreadAsRead(checks()); await settle() })
  await act(async () => { await store().deleteReadNotifications() })
  assert.equal(store().items.length, 0)
  await http.release("PATCH", "/notifications/u1/read", { body: { data: { ...note("u1"), readAt: "2026-11-16T03:00:00.000Z" } } })
  await act(async () => { await marking })
  assert.equal(store().items.length, 0)
})

// 알림 창을 열어 둠 (읽음 답은 그 알림을 읽음 시각과 함께 돌려줌)
async function openModalWith(rows) {
  const http = await loaded(rows, {
    "PATCH /notifications/n-new/read": { body: { data: { ...note("n-new"), readAt: "2026-11-16T03:00:00.000Z" } } },
  })
  await act(async () => { render(React.createElement(NotificationModal, { open: true, onClose: () => {} })); await settle() })
  return http
}

test("A13-F-042 창 열린 채 새 알림 → 읽음 요청 1번", async () => {
  const http = await openModalWith([])
  await act(async () => { store().receiveLiveNotification(ME, note("n-new")); await settle(8) })
  assert.equal(http.to("PATCH", "/notifications/n-new/read").length, 1)
})

test("A13-F-043 같은 id가 다시 와도 읽음 요청 0번 더", async () => {
  const http = await openModalWith([])
  await act(async () => { store().receiveLiveNotification(ME, note("n-new")); await settle(8) })
  const first = http.to("PATCH", "/notifications/n-new/read").length
  await act(async () => { store().receiveLiveNotification(ME, note("n-new")); await settle(8) })
  assert.equal(http.to("PATCH", "/notifications/n-new/read").length - first, 0)
})

const deleteButton = () => screen.getByRole("button", { name: "읽은 메시지 삭제" })

test("A13-F-044 보이는 읽은 알림 1 → \"읽은 메시지 삭제\" 켜짐", async () => {
  await openModalWith([note("r1", { type: "system", read: true })])
  assert.equal(deleteButton().disabled, false)
})

test("A13-F-045 읽은 알림이 끈 종류뿐 → \"읽은 메시지 삭제\" 꺼짐", async () => {
  signIn()
  useSettingsStore.getState().setGeneralCheck("friend-invite", false)
  await openModalWith([note("r1", { type: "friend-request", read: true })])
  assert.equal(deleteButton().disabled, true)
})
