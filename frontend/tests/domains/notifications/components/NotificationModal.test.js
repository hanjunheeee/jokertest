import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://127.0.0.1:5183",
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
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("MutationObserver", class {
  observe() {}
  disconnect() {}
  takeRecords() { return [] }
})
installDomGlobal("localStorage", dom.window.localStorage)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const React = (await import("react")).default
const { act } = await import("react")
const { createRoot } = await import("react-dom/client")

const NotificationModal = (await import("../../../../src/domains/notifications/components/NotificationModal.js")).default
const NotificationEntryButton = (await import("../../../../src/domains/notifications/components/NotificationEntryButton.js")).default
const {
  useNotificationsStore,
  __setNotificationsApiForTests,
  selectUnreadCount,
} = await import("../../../../src/domains/notifications/store/notifications.store.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { useSettingsStore, buildDefaultGeneralChecks } = await import(
  "../../../../src/domains/settings/store/settingsStore.js"
)
const { buildNotificationTargetPath, notificationTargetLabel } = await import(
  "../../../../src/shared/constants/notificationTargets.js"
)
const { resolveAchievementLocation, ACHIEVEMENT_LOCATION_IDS } = await import(
  "../../../../src/domains/library/content/achievementLocation.js"
)
const { NOTIFICATION_ASSETS } = await import("../../../../src/domains/notifications/constants/notificationAssets.js")

const ACCOUNT = "11111111-1111-4111-8111-111111111111"

function notification(overrides = {}) {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    type: "system",
    sourceKey: "system:notifications-available:v1",
    title: "알림 기능 안내",
    body: "친구 요청과 업적 보상은 알림에서 확인하세요.",
    target: { kind: "settings" },
    createdAt: "2026-09-13T00:00:00.000Z",
    readAt: null,
    ...overrides,
  }
}

function setNotificationsApiForTests(overrides = {}) {
  __setNotificationsApiForTests({
    markNotificationReadApi: async (id) => {
      const row = useNotificationsStore.getState().items.find((item) => item.id === id) ?? notification({ id })
      return { ...row, readAt: "2026-09-13T03:00:00.000Z" }
    },
    deleteReadNotificationsApi: async () => ({}),
    ...overrides,
  })
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

function mount(element) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function click(node) {
  act(() => {
    node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

test.beforeEach(() => {
  __setNotificationsApiForTests(null)
  useNotificationsStore.getState().__resetForTests()
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT }, loggedOutIntentionally: false })
  useNotificationsStore.getState().syncAccount()
  useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  document.body.innerHTML = ""
})

test.afterEach(() => {
  __setNotificationsApiForTests(null)
})

test("AC-06: 모달은 매칭 팝업 프레임 셸(dialog·backdrop·확인 버튼)로 그려진다", (t) => {
  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  const dialog = view.container.querySelector('[role="dialog"]')
  assert.ok(dialog, "dialog가 실제로 렌더돼야 한다")
  assert.equal(dialog.getAttribute("aria-modal"), "true")
  assert.equal(dialog.getAttribute("aria-label"), "알림")

  const frame = view.container.querySelector('img[aria-hidden="true"]')
  assert.ok(frame, "매칭 팝업 프레임 이미지가 렌더돼야 한다")
  assert.match(decodeURIComponent(frame.getAttribute("src")), /매칭 팝업 프레임\.png/)

  assert.ok(view.container.querySelector('[data-notification-heading="true"]'), "프레임 상단 제목")
  assert.ok(view.container.querySelector('[aria-label="알림 닫기"]'), "backdrop 닫기 버튼")

  const closeButton = view.container.querySelector('[aria-label="닫기"]')
  assert.ok(closeButton, "우상단 닫기 버튼")
  assert.match(
    decodeURIComponent(closeButton.querySelector("img").getAttribute("src")),
    /팝업 닫기 버튼\.png/,
  )
  assert.equal(closeButton.getAttribute("data-sfx-kind"), "ui-cancel", "닫기는 취소음 표식을 쓴다")
})

test("AC-06: 로딩·실패·빈 상태·목록이 서로 다른 화면으로 구분된다(실패를 빈 목록으로 위장하지 않는다)", async (t) => {
  const slow = deferred()
  let calls = 0
  setNotificationsApiForTests({
    fetchNotificationsApi: () => {
      calls += 1
      return calls === 1 ? slow.promise : Promise.resolve([])
    },
  })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  assert.ok(view.container.querySelector('[data-notification-state="loading"]'))

  const pending = useNotificationsStore.getState().loadSnapshot()
  await act(async () => {
    slow.reject(new Error("조회 실패"))
    await pending
  })

  const errorState = view.container.querySelector('[data-notification-state="error"]')
  assert.ok(errorState, "실패는 실패 화면으로 보인다")
  assert.match(errorState.textContent, /조회 실패/)
  assert.equal(view.container.querySelector('[data-notification-state="empty"]'), null)

  const retry = view.container.querySelector('[data-notification-action="retry-list"]')
  await act(async () => {
    retry.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  assert.equal(calls, 2)
  assert.ok(view.container.querySelector('[data-notification-state="empty"]'), "성공+0건만 빈 상태다")
  assert.match(view.container.textContent, /표시할 알림이 없습니다/)
})

test("AC-06: 표시 설정으로 모두 숨겨지면 빈 상태가 보이고 보관 목록은 남는다", async (t) => {
  setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification()] })
  await act(async () => {
    await useNotificationsStore.getState().loadSnapshot()
  })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)
  assert.ok(view.container.querySelector('[data-notification-state="list"]'))

  act(() => {
    useSettingsStore.setState({
      generalChecks: { ...buildDefaultGeneralChecks(), "system-notification": false },
    })
  })

  assert.ok(view.container.querySelector('[data-notification-state="empty"]'))
  assert.equal(useNotificationsStore.getState().items.length, 1, "보관 목록은 그대로다")

  act(() => {
    useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  })
  assert.ok(view.container.querySelector('[data-notification-state="list"]'), "다시 켜면 그대로 나타난다")
})

test("AC-06: 실패 → 재시도 성공 → 빈 상태 → live 행 도착 순서로 화면이 따라온다", async (t) => {
  let calls = 0
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      calls += 1
      if (calls === 1) throw new Error("일시 오류")
      return []
    },
  })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })
  assert.ok(view.container.querySelector('[data-notification-state="error"]'))

  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })
  assert.ok(view.container.querySelector('[data-notification-state="empty"]'))

  act(() => {
    useNotificationsStore.getState().receiveLiveNotification(ACCOUNT, notification({ id: "live-1" }))
  })
  assert.equal(view.container.querySelectorAll("[data-notification-id]").length, 1)
})

function manyNotifications(count) {
  return Array.from({ length: count }, (_, index) => notification({
    id: `n${index}`,
    sourceKey: `system:seed:${index}`,
    title: `알림 ${index}`,
    createdAt: new Date(Date.UTC(2026, 8, 13, 0, 0, count - index)).toISOString(),
  }))
}

test("AC-06(Chrome 회귀): 긴 목록에서도 제목·닫기 버튼은 스크롤 영역 밖에 고정되고 목록만 스크롤한다", async (t) => {
  setNotificationsApiForTests({ fetchNotificationsApi: async () => manyNotifications(6) })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  const content = view.container.querySelector('[data-notification-content="true"]')
  const scrollWrap = view.container.querySelector("[data-notification-scroll-wrap]")
  const scroll = view.container.querySelector("[data-notification-scroll]")
  const heading = view.container.querySelector("[data-notification-heading]")
  const confirm = view.container.querySelector('[aria-label="닫기"]')
  assert.ok(content && scrollWrap && scroll && heading && confirm)

  assert.equal(scrollWrap.parentElement, content)
  assert.equal(confirm.closest('[data-notification-content="true"]'), null, "닫기는 본문 스크롤 영역 밖(프레임 위)에 있다")
  assert.equal(scroll.contains(heading), false)
  assert.equal(scroll.contains(confirm), false, "닫기 버튼이 목록과 함께 스크롤되면 화면 밖으로 밀린다")

  const rows = view.container.querySelectorAll("[data-notification-id]")
  assert.equal(rows.length, 6)
  for (const row of rows) assert.equal(scroll.contains(row), true)
  assert.equal(scroll.getAttribute("data-notification-scroll"), "list")

  assert.ok(scrollWrap.className.includes("flex-1"), "스크롤 래퍼가 남은 높이를 채운다")
  for (const required of ["min-h-0", "overflow-y-auto"]) {
    assert.ok(scroll.className.includes(required), `목록 영역에 ${required}가 필요하다`)
  }
  assert.ok(content.className.includes("overflow-hidden"), "안쪽 영역 자체는 스크롤하지 않는다")
  assert.equal(
    content.className.includes("overflow-y-auto"),
    false,
    "안쪽 영역이 다시 스크롤 상자가 되면 초점 이동이 내용 전체를 끌어내린다",
  )

  assert.ok(content.className.includes("absolute"), "본문은 프레임 inset 위에 배치된다")
  assert.ok(content.className.includes("overflow-hidden"), "본문 영역 자체는 스크롤하지 않는다")

  assert.equal(document.activeElement, confirm)
  assert.equal(scroll.scrollTop, 0, "열자마자 목록은 맨 위(가장 새 알림)를 보여준다")
  assert.equal(rows[0].textContent.includes("알림 0"), true, "첫 행이 가장 새 알림이다")
})

test("AC-06(Chrome 회귀): 프레임 이미지가 실패한 대체 패널에서도 같은 3단 구조를 유지한다", async (t) => {
  setNotificationsApiForTests({ fetchNotificationsApi: async () => manyNotifications(6) })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  act(() => {
    view.container
      .querySelector('img[aria-hidden="true"]')
      .dispatchEvent(new dom.window.Event("error", { bubbles: false }))
  })
  assert.ok(view.container.querySelector('[data-notification-fallback="true"]'), "대체 패널로 전환된다")

  const content = view.container.querySelector('[data-notification-content="true"]')
  const scrollWrap = view.container.querySelector("[data-notification-scroll-wrap]")
  assert.equal(view.container.querySelector("[data-notification-heading]"), null, "대체 패널에는 프레임 제목이 없다")
  assert.equal(view.container.querySelector('[aria-label="닫기"]').closest('[data-notification-content="true"]'), null)
  assert.equal(scrollWrap.parentElement, content)
  assert.equal(view.container.querySelectorAll("[data-notification-id]").length, 6)
  assert.ok(scrollWrap.className.includes("flex-1"))
  assert.ok(content.className.includes("max-h-[80svh]"), "대체 패널도 화면을 넘지 않는다")
  assert.ok(content.className.includes("overflow-hidden"))
})

test("AC-06(Chrome 회귀): 짧은 상태(로딩·실패·빈 상태)는 가운데 정렬을 유지하고 닫기는 그대로다", async (t) => {
  let calls = 0
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      calls += 1
      if (calls === 1) throw new Error("조회 실패")
      return []
    },
  })

  let closes = 0
  const view = mount(
    React.createElement(NotificationModal, { open: true, onClose: () => { closes += 1 } }),
  )
  t.after(view.unmount)

  const scrollOf = () => view.container.querySelector("[data-notification-scroll]")
  assert.equal(scrollOf().getAttribute("data-notification-scroll"), "loading")
  assert.ok(scrollOf().className.includes("justify-center"))

  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })
  assert.equal(scrollOf().getAttribute("data-notification-scroll"), "error")
  assert.ok(scrollOf().querySelector('[data-notification-action="retry-list"]'), "재시도는 스크롤 영역 안이다")

  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })
  assert.equal(scrollOf().getAttribute("data-notification-scroll"), "empty")

  click(view.container.querySelector('[aria-label="닫기"]'))
  assert.equal(closes, 1, "레이아웃이 바뀌어도 닫기는 그대로 동작한다")
})

test("AC-06: 알림 항목은 입력창 슬롯·수락 액션 버튼 리소스를 쓴다", async (t) => {
  setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification()] })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  const item = view.container.querySelector("[data-notification-id]")
  assert.ok(item)
  assert.ok(item.className.includes("min-h-["), "입력창 슬롯 세로 min-height가 적용돼야 한다")

  const slotImg = item.querySelector("img")
  assert.ok(slotImg)
  assert.match(decodeURIComponent(slotImg.getAttribute("src")), /입력창1\.png/)
  assert.ok(slotImg.className.includes("object-fill"), "슬롯 배경은 세로로 늘려 채운다")

  const openBtn = view.container.querySelector('[data-notification-action="open-target"] img')
  assert.ok(openBtn)
  assert.match(decodeURIComponent(openBtn.getAttribute("src")), /버튼\(수락 및 긍정\)\.png/)
  assert.ok(NOTIFICATION_ASSETS.actionButtonPrimary.normalize("NFC").includes("버튼(수락 및 긍정).png"))

  const deleteBtn = view.container.querySelector('[data-notification-action="delete-read"]')
  assert.ok(deleteBtn, "좌측 하단 삭제 버튼이 있어야 한다")
  assert.match(decodeURIComponent(deleteBtn.querySelector("img").getAttribute("src")), /버튼\(미선택\)\.png/)
  assert.ok(view.container.querySelector("[data-notification-footer]"))
})

test("읽은 메시지 삭제 버튼이 readAt 있는 항목을 모두 지운다", async (t) => {
  const rows = [
    notification({ id: "read-1", readAt: "2026-09-13T01:00:00.000Z" }),
    notification({ id: "read-2", sourceKey: "s2", readAt: "2026-09-13T02:00:00.000Z" }),
  ]
  let deleteCalled = false
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => rows,
    deleteReadNotificationsApi: async () => {
      deleteCalled = true
    },
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  const deleteButton = view.container.querySelector('[data-notification-action="delete-read"]')
  assert.equal(deleteButton.disabled, false)

  await act(async () => {
    deleteButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  assert.equal(deleteCalled, true)
  assert.equal(useNotificationsStore.getState().items.length, 0)
  assert.equal(view.container.querySelector('[data-notification-state="empty"]')?.textContent, "표시할 알림이 없습니다.")
})

test("읽은 메시지 삭제는 미확인 알림은 남긴다", async (t) => {
  setNotificationsApiForTests({
    deleteReadNotificationsApi: async () => ({}),
  })
  act(() => {
    useNotificationsStore.setState({
      accountId: ACCOUNT,
      status: "success",
      items: [
        notification({ id: "read-1", readAt: "2026-09-13T01:00:00.000Z" }),
        notification({ id: "unread-1", sourceKey: "s2", readAt: null }),
      ],
    })
  })

  const result = await act(async () => useNotificationsStore.getState().deleteReadNotifications())
  assert.equal(result.ok, true)
  assert.equal(useNotificationsStore.getState().items.length, 1)
  assert.equal(useNotificationsStore.getState().items[0].id, "unread-1")
})

test("AC-02: 모달을 열면 표시된 미확인 알림이 모두 읽음 처리된다", async (t) => {
  const rows = [
    notification({ id: "n1" }),
    notification({ id: "n2", sourceKey: "s2" }),
  ]
  const patched = new Set()
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => rows,
    markNotificationReadApi: async (id) => {
      patched.add(id)
      return { ...rows.find((r) => r.id === id), readAt: "2026-09-13T03:00:00.000Z" }
    },
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  assert.deepEqual([...patched].sort(), ["n1", "n2"])
  assert.equal(view.container.querySelectorAll('[data-notification-read="false"]').length, 0)
  assert.equal(view.container.querySelectorAll("[data-notification-unread]").length, 0)
  assert.equal(selectUnreadCount(useNotificationsStore.getState().items, buildDefaultGeneralChecks()), 0)
})

test("AC-02/A-06: 읽음이 실패하면 오류·재시도가 보이고 이동하지 않는다", async (t) => {
  let shouldFail = true
  const row = notification({ id: "n1", type: "achievement", sourceKey: "achievement:noble-win-10:granted", target: { kind: "achievement", achievementId: "noble-win-10" } })
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row],
    markNotificationReadApi: async () => {
      if (shouldFail) throw new Error("읽음 서버 오류")
      return { ...row, readAt: "2026-09-13T03:00:00.000Z" }
    },
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const navigated = []
  const view = mount(
    React.createElement(NotificationModal, {
      open: true,
      onClose: () => {},
      onNavigate: (path) => navigated.push(path),
    }),
  )
  t.after(view.unmount)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  const openTarget = view.container.querySelector('[data-notification-action="open-target"]')
  assert.equal(openTarget.textContent, "기억의 서고에서 보기")
  await act(async () => {
    openTarget.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  assert.deepEqual(navigated, [], "읽음이 실패했는데 이동만 수행하면 안 된다")
  const error = view.container.querySelector("[data-notification-read-error]")
  assert.ok(error)
  assert.match(error.textContent, /읽음 서버 오류/)
  assert.equal(
    view.container.querySelector('[data-notification-id="n1"]').getAttribute("data-notification-read"),
    "false",
    "실패를 성공으로 위장하지 않는다",
  )

  shouldFail = false
  const retry = view.container.querySelector('[data-notification-action="retry-read"]')
  await act(async () => {
    retry.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
  assert.equal(
    view.container.querySelector('[data-notification-id="n1"]').getAttribute("data-notification-read"),
    "true",
  )
})

test("AC-02: 읽음이 성공하면 실제 대상 경로로 이동한다", async (t) => {
  const row = notification({
    id: "n1", type: "friend-request", sourceKey: "friend-request:42:received",
    target: { kind: "friend-request", requestId: 42 },
  })
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row],
    markNotificationReadApi: async () => ({ ...row, readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const navigated = []
  const view = mount(
    React.createElement(NotificationModal, {
      open: true, onClose: () => {}, onNavigate: (path) => navigated.push(path),
    }),
  )
  t.after(view.unmount)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  await act(async () => {
    view.container
      .querySelector('[data-notification-action="open-target"]')
      .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  assert.deepEqual(navigated, ["/lobby?notificationRequestId=42"])
})

test("AC-02: 해석할 수 없는 대상에는 이동 버튼 자체가 없다(임의 URL로 나가지 않는다)", async (t) => {
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => [
      notification({ id: "weird", target: { kind: "external", url: "https://example.com" } }),
    ],
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  assert.equal(view.container.querySelector('[data-notification-action="open-target"]'), null)
  assert.equal(view.container.querySelector("[data-notification-action]"), null, "액션 버튼이 없어야 한다")
})

test("AC-06: 확인 버튼·backdrop·Escape 모두 닫기를 부르고, 조회 실패 중에도 닫힌다", async (t) => {
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => { throw new Error("조회 실패") },
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  let closes = 0
  const view = mount(
    React.createElement(NotificationModal, { open: true, onClose: () => { closes += 1 } }),
  )
  t.after(view.unmount)

  assert.ok(view.container.querySelector('[data-notification-state="error"]'))

  click(view.container.querySelector('[aria-label="닫기"]'))
  assert.equal(closes, 1)

  click(view.container.querySelector('[aria-label="알림 닫기"]'))
  assert.equal(closes, 2)

  act(() => {
    window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  })
  assert.equal(closes, 3, "Escape로도 닫혀야 한다")
})

test("AC-06: 닫으면 열기 전에 초점을 갖고 있던 요소로 초점이 돌아온다", (t) => {
  const opener = document.createElement("button")
  document.body.appendChild(opener)
  opener.focus()
  t.after(() => opener.remove())

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  assert.notEqual(document.activeElement, opener, "셸이 확인 버튼으로 초점을 옮긴다")

  view.rerender(React.createElement(NotificationModal, { open: false, onClose: () => {} }))
  assert.equal(document.activeElement, opener)
})

test("AC-05: 계정이 바뀌면 열려 있던 모달의 내용이 비워진다", async (t) => {
  setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification({ id: "a-only" })] })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)
  assert.equal(view.container.querySelectorAll("[data-notification-id]").length, 1)

  act(() => {
    useAuthStore.setState({ isLoggedIn: false, user: null, loggedOutIntentionally: true })
    useNotificationsStore.getState().syncAccount()
  })

  assert.equal(view.container.querySelectorAll("[data-notification-id]").length, 0)
  assert.equal(useNotificationsStore.getState().open, false)
})

test("AC-01: 진입 버튼의 미확인 수가 실제 목록을 따라 갱신된다", async (t) => {
  setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationEntryButton, { onOpen: () => {} }))
  t.after(view.unmount)

  const button = view.container.querySelector("[data-notification-entry]")
  assert.equal(button.getAttribute("data-notification-unread-count"), "0")
  assert.equal(button.getAttribute("aria-label"), "알림")

  act(() => {
    useNotificationsStore.getState().receiveLiveNotification(ACCOUNT, notification({ id: "n1" }))
  })
  assert.equal(button.getAttribute("data-notification-unread-count"), "1")
  assert.equal(button.getAttribute("aria-label"), "알림 (읽지 않음 1개)")

  act(() => {
    useNotificationsStore.getState().receiveLiveNotification(
      ACCOUNT,
      notification({ id: "n2", sourceKey: "s2", type: "friend-request" }),
    )
  })
  assert.equal(button.getAttribute("data-notification-unread-count"), "2")
})

test("AC-04: 설정을 끈 종류는 미확인 수에서 빠지고, 다시 켜면 돌아온다", async (t) => {
  setNotificationsApiForTests({
    fetchNotificationsApi: async () => [
      notification({ id: "f", type: "friend-request", sourceKey: "friend-request:1:received" }),
      notification({ id: "s", type: "system" }),
    ],
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationEntryButton, { onOpen: () => {} }))
  t.after(view.unmount)
  const button = view.container.querySelector("[data-notification-entry]")
  assert.equal(button.getAttribute("data-notification-unread-count"), "2")

  act(() => {
    useSettingsStore.setState({
      generalChecks: { ...buildDefaultGeneralChecks(), "friend-invite": false },
    })
  })
  assert.equal(button.getAttribute("data-notification-unread-count"), "1")

  act(() => {
    useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  })
  assert.equal(button.getAttribute("data-notification-unread-count"), "2")
})

test("AC-01: 진입 버튼 클릭이 모달 열기 핸들러를 실제로 부른다", (t) => {
  let opened = 0
  const view = mount(React.createElement(NotificationEntryButton, { onOpen: () => { opened += 1 } }))
  t.after(view.unmount)

  click(view.container.querySelector("[data-notification-entry]"))
  assert.equal(opened, 1)
})

test("AC-02: 대상 경로는 확인된 세 형태만 만들고 나머지는 null이다", () => {
  assert.equal(buildNotificationTargetPath({ kind: "friend-request", requestId: 7 }), "/lobby?notificationRequestId=7")
  assert.equal(
    buildNotificationTargetPath({ kind: "achievement", achievementId: "witch-hunter-win-30" }),
    "/library?achievementId=witch-hunter-win-30",
  )
  assert.equal(buildNotificationTargetPath({ kind: "settings" }), "/setting")

  for (const bad of [
    null, undefined, {}, [], "settings",
    { kind: "external", url: "https://example.com" },
    { kind: "friend-request" },
    { kind: "friend-request", requestId: "7" },
    { kind: "achievement", achievementId: "" },
    { kind: "achievement" },
  ]) {
    assert.equal(buildNotificationTargetPath(bad), null, JSON.stringify(bad))
  }

  assert.equal(notificationTargetLabel({ kind: "settings" }), "환경설정 열기")
  assert.equal(notificationTargetLabel({ kind: "external" }), null)
})

test("AC-02: 22개 업적 id 전부가 서고의 실제 탭·페이지·직업으로 해석된다", () => {
  assert.equal(ACHIEVEMENT_LOCATION_IDS.length, 22)

  assert.deepEqual(resolveAchievementLocation("record-1-masquerade"), {
    tabId: "forbiddenRecords", pageIndex: 0, jobIndex: null,
  })
  assert.deepEqual(resolveAchievementLocation("record-7-erased-night"), {
    tabId: "forbiddenRecords", pageIndex: 6, jobIndex: null,
  })
  assert.deepEqual(resolveAchievementLocation("noble-win-10"), {
    tabId: "invitedGuests", pageIndex: 0, jobIndex: 0,
  })
  assert.deepEqual(resolveAchievementLocation("witch-hunter-win-30"), {
    tabId: "invitedGuests", pageIndex: 0, jobIndex: 4,
  })
  assert.deepEqual(resolveAchievementLocation("doctor-win-20"), {
    tabId: "invitedGuests", pageIndex: 0, jobIndex: 2,
  })

  for (const unknown of ["", "record-8-nope", "noble-win-99", null, undefined, 7]) {
    assert.equal(resolveAchievementLocation(unknown), null, String(unknown))
  }
})
