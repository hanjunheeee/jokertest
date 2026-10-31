import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://127.0.0.1:5183/lobby",
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
installDomGlobal("MouseEvent", dom.window.MouseEvent)
installDomGlobal("KeyboardEvent", dom.window.KeyboardEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = (await import("react")).default
const { act, createElement, useMemo, useState } = await import("react")
const { createRoot } = await import("react-dom/client")

const { useLobbyNotificationPanels, parseFriendRequestTargetId } = await import(
  "../useLobbyNotificationPanels.js"
)
const NotificationModal = (await import("../../../notifications/components/NotificationModal.js")).default
const NotificationEntryButton = (
  await import("../../../notifications/components/NotificationEntryButton.js")
).default
const { useNotificationsStore, __setNotificationsApiForTests } = await import(
  "../../../notifications/store/notifications.store.js"
)
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useSettingsStore, buildDefaultGeneralChecks } = await import(
  "../../../settings/store/settingsStore.js"
)

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111"
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222"

function friendNotification(overrides = {}) {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000042",
    type: "friend-request",
    sourceKey: "friend-request:42:received",
    title: "새 친구 요청",
    body: "친구 요청이 도착했습니다.",
    target: { kind: "friend-request", requestId: 42 },
    createdAt: "2026-09-13T00:00:00.000Z",
    readAt: null,
    ...overrides,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function LobbyConsumer({ initialSearch = "", navigations }) {
  const [search, setSearch] = useState(initialSearch)
  const searchParams = useMemo(() => new URLSearchParams(search), [search])

  const panels = useLobbyNotificationPanels({
    searchParams,
    navigate: (path) => {
      navigations.push(path)
      const [, query = ""] = path.split("?")
      setSearch(query)
    },
  })

  return createElement(
    "div",
    null,
    createElement(NotificationEntryButton, {
      open: panels.notificationsOpen,
      onOpen: panels.openNotifications,
    }),
    createElement(NotificationModal, {
      open: panels.notificationsOpen,
      onClose: panels.closeNotifications,
      onNavigate: panels.handleNotificationNavigate,
    }),
    createElement(
      "div",
      {
        "data-friend-panel": "true",
        "data-friend-panel-open": String(panels.friendListOpen),
        "data-friend-panel-target": panels.friendRequestTargetId === null
          ? ""
          : String(panels.friendRequestTargetId),
      },
      createElement(
        "button",
        { type: "button", "data-action": "close-friend-panel", onClick: panels.closeFriendList },
        "친구 패널 닫기",
      ),
    ),
  )
}

function mount(element) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function click(node) {
  await act(async () => {
    node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

const friendPanelOpen = (view) =>
  view.container.querySelector("[data-friend-panel]").getAttribute("data-friend-panel-open")
const friendPanelTarget = (view) =>
  view.container.querySelector("[data-friend-panel]").getAttribute("data-friend-panel-target")
const dialog = (view) => view.container.querySelector('[role="dialog"]')

test.beforeEach(() => {
  __setNotificationsApiForTests(null)
  useNotificationsStore.getState().__resetForTests()
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT_A }, loggedOutIntentionally: false })
  useNotificationsStore.getState().syncAccount()
  useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  document.body.innerHTML = ""
})

test.afterEach(() => {
  __setNotificationsApiForTests(null)
})

test("AC-01: 진입 버튼이 실제 모달을 열고 닫기 버튼이 실제로 닫는다", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })
  const view = mount(React.createElement(LobbyConsumer, { navigations: [] }))
  t.after(view.unmount)

  assert.equal(dialog(view), null)

  await click(view.container.querySelector("[data-notification-entry]"))
  assert.ok(dialog(view), "진입 버튼이 실제 모달을 열어야 한다")
  assert.equal(useNotificationsStore.getState().open, true, "열림 상태의 소유자는 store다")

  await click(view.container.querySelector('[aria-label="닫기"]'))
  assert.equal(dialog(view), null)
  assert.equal(useNotificationsStore.getState().open, false)
})

test("AC-05/R-IMPL#3: 로그아웃 없는 A→B 직접 전환이 열려 있던 실제 모달을 닫는다", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [friendNotification()] })
  await act(async () => {
    await useNotificationsStore.getState().loadSnapshot()
  })

  const view = mount(React.createElement(LobbyConsumer, { navigations: [] }))
  t.after(view.unmount)

  await click(view.container.querySelector("[data-notification-entry]"))
  assert.ok(dialog(view))
  assert.equal(view.container.querySelectorAll("[data-notification-id]").length, 1)

  await act(async () => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT_B }, loggedOutIntentionally: false })
    useNotificationsStore.getState().syncAccount()
  })

  assert.equal(dialog(view), null, "계정이 바뀌면 열려 있던 실제 모달이 닫혀야 한다")
  assert.equal(view.container.querySelectorAll("[data-notification-id]").length, 0)
  assert.equal(
    view.container.querySelector("[data-notification-entry]").getAttribute("data-notification-unread-count"),
    "0",
  )
})

test("AC-05/R-IMPL#3: 계정이 바뀐 뒤 해소된 A의 PATCH는 이동을 일으키지 않는다", async (t) => {
  const slowPatch = deferred()
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [friendNotification()],
    markNotificationReadApi: () => slowPatch.promise,
  })
  await act(async () => {
    await useNotificationsStore.getState().loadSnapshot()
  })

  const navigations = []
  const view = mount(React.createElement(LobbyConsumer, { navigations }))
  t.after(view.unmount)

  await click(view.container.querySelector("[data-notification-entry]"))
  await click(view.container.querySelector('[data-notification-action="open-target"]'))
  assert.deepEqual(navigations, [], "읽음 확정 전에는 이동하지 않는다")

  await act(async () => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT_B }, loggedOutIntentionally: false })
    useNotificationsStore.getState().syncAccount()
  })

  await act(async () => {
    slowPatch.resolve({ ...friendNotification(), readAt: "2026-09-13T03:00:00.000Z" })
    await Promise.resolve()
    await Promise.resolve()
  })

  assert.deepEqual(navigations, [], "이전 계정의 늦은 읽음 응답으로 이동하면 안 된다")
  assert.equal(dialog(view), null)
  assert.equal(friendPanelOpen(view), "false")
})

test("AC-02/R-IMPL#3: 같은 notificationRequestId로 다시 들어오면 닫아 둔 친구 패널이 다시 열린다", async (t) => {
  const row = friendNotification()
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row],
    markNotificationReadApi: async (id) => ({ ...row, id, readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await act(async () => {
    await useNotificationsStore.getState().loadSnapshot()
  })

  const navigations = []
  const view = mount(React.createElement(LobbyConsumer, { navigations }))
  t.after(view.unmount)

  await click(view.container.querySelector("[data-notification-entry]"))
  await click(view.container.querySelector('[data-notification-action="open-target"]'))

  assert.deepEqual(navigations, ["/lobby?notificationRequestId=42"])
  assert.equal(dialog(view), null, "이동하면 모달은 닫힌다")
  assert.equal(friendPanelOpen(view), "true")
  assert.equal(friendPanelTarget(view), "42")

  await click(view.container.querySelector('[data-action="close-friend-panel"]'))
  assert.equal(friendPanelOpen(view), "false")

  await click(view.container.querySelector("[data-notification-entry]"))
  await click(view.container.querySelector('[data-notification-action="open-target"]'))

  assert.deepEqual(navigations, ["/lobby?notificationRequestId=42", "/lobby?notificationRequestId=42"])
  assert.equal(friendPanelOpen(view), "true", "같은 대상 재진입도 친구 패널을 다시 열어야 한다")
  assert.equal(friendPanelTarget(view), "42", "요청을 새로 만들지 않고 같은 원본 id를 가리킨다")
})

test("AC-02: 대상 질의가 없으면 친구 패널을 열지 않고, 잘못된 값도 대상으로 인정하지 않는다", (t) => {
  const view = mount(React.createElement(LobbyConsumer, { navigations: [], initialSearch: "" }))
  t.after(view.unmount)
  assert.equal(friendPanelOpen(view), "false")
  assert.equal(friendPanelTarget(view), "")

  const bad = mount(
    React.createElement(LobbyConsumer, { navigations: [], initialSearch: "notificationRequestId=abc" }),
  )
  t.after(bad.unmount)
  assert.equal(friendPanelOpen(bad), "false", "정수가 아닌 대상은 패널을 열지 않는다")
})

test("AC-02: 대상 질의 해석은 양의 정수만 인정한다", () => {
  const parse = (search) => parseFriendRequestTargetId(new URLSearchParams(search))
  assert.equal(parse("notificationRequestId=42"), 42)
  assert.equal(parse("notificationRequestId=0"), 0)
  assert.equal(parse(""), null)
  assert.equal(parse("notificationRequestId="), null)
  assert.equal(parse("notificationRequestId=-1"), null)
  assert.equal(parse("notificationRequestId=4.2"), null)
  assert.equal(parse("notificationRequestId=abc"), null)
  assert.equal(parseFriendRequestTargetId(null), null)
})
