// 알림 버그 수정 확인: 지우기 실패 되돌림·자동 읽음 겹침·열린 동안 새 알림 자동 읽음·숨긴 종류 삭제 버튼
import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://127.0.0.1:5183" })
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  localStorage: dom.window.localStorage,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} takeRecords() { return [] } },
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const React = (await import("react")).default
const { act } = await import("react")
const { createRoot } = await import("react-dom/client")
const NotificationModal = (await import("../../../../src/domains/notifications/components/NotificationModal.js")).default
const { useNotificationsStore, __setNotificationsApiForTests } = await import(
  "../../../../src/domains/notifications/store/notifications.store.js"
)
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { useSettingsStore, buildDefaultGeneralChecks } = await import("../../../../src/domains/settings/store/settingsStore.js")
const { SETTING_KEY_BY_TYPE } = await import("../../../../src/domains/notifications/constants/notificationSettingKeys.js")

const ME = "11111111-1111-4111-8111-111111111111"
const READ_AT = "2026-11-09T01:00:00.000Z"

function row(overrides = {}) {
  return {
    id: "n1",
    type: "system",
    sourceKey: "system:seed:1",
    title: "알림",
    body: "본문",
    target: { kind: "settings" },
    createdAt: "2026-11-09T00:00:00.000Z",
    readAt: null,
    ...overrides,
  }
}

const flush = async (n = 10) => { for (let i = 0; i < n; i += 1) await Promise.resolve() }

test.beforeEach(() => {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ME }, loggedOutIntentionally: false })
  useNotificationsStore.getState().__resetForTests()
  useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  __setNotificationsApiForTests(null)
  document.body.innerHTML = ""
})

test("3장 deleteActions: 지우기가 실패하면 뺀 알림만 되돌리고, 그사이 온 알림은 남김", async () => {
  let rejectDelete
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row({ id: "old", readAt: READ_AT })],
    deleteReadNotificationsApi: () => new Promise((_, reject) => { rejectDelete = reject }),
  })
  await useNotificationsStore.getState().loadSnapshot()

  const pending = useNotificationsStore.getState().deleteReadNotifications()
  useNotificationsStore.getState().receiveLiveNotification(ME, row({ id: "new", sourceKey: "system:seed:2" }))
  rejectDelete(new Error("삭제 실패"))
  await pending

  const ids = useNotificationsStore.getState().items.map((item) => item.id).sort()
  assert.deepEqual(ids, ["new", "old"])
})

test("3장 readActions: 자동 읽음 응답이 지우기 뒤에 와도 지운 알림이 다시 나타나지 않음", async () => {
  let resolveRead
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row({ id: "a" })],
    markNotificationReadApi: (id) => new Promise((resolve) => { resolveRead = () => resolve(row({ id, readAt: READ_AT })) }),
    deleteReadNotificationsApi: async () => ({ deleted: 1 }),
  })
  await useNotificationsStore.getState().loadSnapshot()

  const marking = useNotificationsStore.getState().markVisibleUnreadAsRead(buildDefaultGeneralChecks())
  await useNotificationsStore.getState().deleteReadNotifications()
  assert.equal(useNotificationsStore.getState().items.length, 0)
  resolveRead()
  await marking
  assert.equal(useNotificationsStore.getState().items.length, 0, "지운 알림은 되살아나지 않음")
})

test("3장 useAutoMarkRead: 창이 열린 동안 새로 온 알림도 읽음으로 보냄", async () => {
  const sent = []
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row({ id: "first", readAt: READ_AT })],
    markNotificationReadApi: async (id) => { sent.push(id); return row({ id, readAt: READ_AT }) },
  })
  await useNotificationsStore.getState().loadSnapshot()

  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(NotificationModal, { open: true, onClose: () => {} })) })
  assert.deepEqual(sent, [])

  await act(async () => {
    useNotificationsStore.getState().receiveLiveNotification(ME, row({ id: "live", sourceKey: "system:seed:3" }))
    await flush()
  })
  assert.deepEqual(sent, ["live"])
  await act(async () => { root.unmount() })
})

test("NotificationModal.js:37: 숨긴 종류의 읽은 알림만 있으면 '읽은 메시지 삭제'가 잠김", async () => {
  const hiddenType = Object.keys(SETTING_KEY_BY_TYPE)[0]
  assert.ok(hiddenType, "설정으로 숨길 수 있는 종류가 있어야 함")
  const checks = { ...buildDefaultGeneralChecks(), [SETTING_KEY_BY_TYPE[hiddenType]]: false }
  useSettingsStore.setState({ generalChecks: checks })
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row({ id: "hidden", type: hiddenType, readAt: READ_AT })],
  })
  await useNotificationsStore.getState().loadSnapshot()

  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(NotificationModal, { open: true, onClose: () => {} })) })
  const button = container.querySelector('[data-notification-action="delete-read"]')
  assert.ok(button)
  assert.equal(button.disabled, true)
  await act(async () => { root.unmount() })
})
