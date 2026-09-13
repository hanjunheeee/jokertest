import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// F-17 알림 모달·진입 버튼 DOM 시험.
//
// 문자열 배선 검사를 하지 않는다 — **실제 컴포넌트**를 JSDOM에 렌더해서 기존 양피지 셸
// (InGameParchmentModalBase → InGameParchmentPanelBase → 확인 버튼)이 실제로 그려지는지,
// 상태별 화면(로딩/실패+재시도/빈 상태/목록)이 구분되는지, 읽음·이동·닫기가 실제 DOM
// 조작으로 동작하는지를 확인한다(InvitedGuestsChallengeRow·파치먼트 시험과 같은 관례).
// ---------------------------------------------------------------------------

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
installDomGlobal("localStorage", dom.window.localStorage)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = (await import("react")).default
const { act } = await import("react")
const { createRoot } = await import("react-dom/client")

const NotificationModal = (await import("../NotificationModal.js")).default
const NotificationEntryButton = (await import("../NotificationEntryButton.js")).default
const {
  useNotificationsStore,
  __setNotificationsApiForTests,
} = await import("../../store/notifications.store.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useSettingsStore, buildDefaultGeneralChecks } = await import(
  "../../../settings/store/settingsStore.js"
)
const { buildNotificationTargetPath, notificationTargetLabel } = await import(
  "../../constants/notificationTargets.js"
)
const { resolveAchievementLocation, ACHIEVEMENT_LOCATION_IDS } = await import(
  "../../../library/content/achievementLocation.js"
)
const { INGAME_PARCHMENT_MODAL_VARIANTS } = await import(
  "../../../game/ingame/constants/parchment/ingameParchmentModalVariants.js"
)

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

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 실제 React 루트에 렌더한다. 반환한 unmount는 t.after에서 부른다. */
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

// ---------------------------------------------------------------------------
// AC-06: 기존 모달 셸 리소스 + 상태별 화면
// ---------------------------------------------------------------------------

test("AC-06: 모달은 기존 파치먼트 셸(양피지 이미지·dialog·backdrop·확인 버튼)로 그려진다", (t) => {
  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  const dialog = view.container.querySelector('[role="dialog"]')
  assert.ok(dialog, "기존 셸의 dialog가 실제로 렌더돼야 한다")
  assert.equal(dialog.getAttribute("aria-modal"), "true")
  assert.equal(dialog.getAttribute("aria-label"), "알림")

  const parchment = view.container.querySelector('img[aria-hidden="true"]')
  assert.ok(parchment, "양피지 배경 이미지가 기존 셸에서 와야 한다")
  assert.match(decodeURIComponent(parchment.getAttribute("src")), /양피지 모달\.png/)

  assert.ok(view.container.querySelector('[aria-label="알림 닫기"]'), "backdrop 닫기 버튼")
  assert.ok(view.container.querySelector('[aria-label="닫기"]'), "확인(닫기) 버튼")
  assert.equal(
    view.container.querySelector('[aria-label="닫기"]').getAttribute("data-sfx-kind"),
    "ui-confirm",
    "닫기 버튼은 기존 의미 표식을 그대로 쓴다",
  )
})

test("AC-06: 로딩·실패·빈 상태·목록이 서로 다른 화면으로 구분된다(실패를 빈 목록으로 위장하지 않는다)", async (t) => {
  const slow = deferred()
  let calls = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: () => {
      calls += 1
      return calls === 1 ? slow.promise : Promise.resolve([])
    },
  })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  // 조회 시작 전: idle도 로딩 화면으로 취급한다(빈 상태가 아니다).
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

  // 재시도 버튼이 실제 GET을 다시 실행한다.
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
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification()] })
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
  __setNotificationsApiForTests({
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

// ---------------------------------------------------------------------------
// AC-06: 긴 목록 레이아웃 — 실제 외부 Chrome(1920x855)에서 재현된 결함의 회귀 시험.
//
// 재현된 것: 알림 4건이면 양피지 안쪽 영역 하나가 scrollHeight 743 / clientHeight 427로
// 넘쳤고, 셸의 focusConfirmOnMount가 맨 아래 닫기 버튼으로 초점을 옮기자 그 상자가
// scrollTop 270까지 끌려 내려가 제목과 가장 새 알림이 화면 밖으로 나가고 행이 양피지 그림
// 밖에 그려졌다. JSDOM에는 레이아웃 엔진이 없으므로 픽셀이 아니라 **그 결함을 가능하게 한
// 구조**를 고정한다: 스크롤 상자가 목록 하나뿐이고, 제목·닫기 버튼이 그 밖의 형제다.
// ---------------------------------------------------------------------------

function manyNotifications(count) {
  return Array.from({ length: count }, (_, index) => notification({
    id: `n${index}`,
    sourceKey: `system:seed:${index}`,
    title: `알림 ${index}`,
    // 최신순 정렬이므로 index가 클수록 오래된 것이 된다 → 목록 첫 행이 가장 새 알림이다.
    createdAt: new Date(Date.UTC(2026, 8, 13, 0, 0, count - index)).toISOString(),
  }))
}

test("AC-06(Chrome 회귀): 긴 목록에서도 제목·닫기 버튼은 스크롤 영역 밖에 고정되고 목록만 스크롤한다", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => manyNotifications(6) })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  const content = view.container.querySelector('[data-parchment-content="true"]')
  const scroll = view.container.querySelector("[data-notification-scroll]")
  const heading = view.container.querySelector("[data-notification-heading]")
  const confirm = view.container.querySelector('[aria-label="닫기"]')
  assert.ok(content && scroll && heading && confirm)

  // 1) 세 덩어리가 안쪽 영역의 형제다 — 제목/닫기가 목록과 같이 스크롤되지 않는다.
  assert.equal(heading.parentElement, content)
  assert.equal(scroll.parentElement, content)
  assert.equal(confirm.parentElement, content)
  assert.equal(scroll.contains(heading), false)
  assert.equal(scroll.contains(confirm), false, "닫기 버튼이 목록과 함께 스크롤되면 화면 밖으로 밀린다")

  // 2) 6건 전부가 스크롤 영역 **안에** 있다(목록은 잘리지 않고 접근 가능하다).
  const rows = view.container.querySelectorAll("[data-notification-id]")
  assert.equal(rows.length, 6)
  for (const row of rows) assert.equal(scroll.contains(row), true)
  assert.equal(scroll.getAttribute("data-notification-scroll"), "list")

  // 3) 스크롤하는 상자는 목록 영역뿐이다. min-h-0이 없으면 flex 항목이 줄어들지 못해
  //    예전처럼 바깥이 다시 넘친다.
  for (const required of ["min-h-0", "flex-auto", "overflow-y-auto"]) {
    assert.ok(scroll.className.includes(required), `목록 영역에 ${required}가 필요하다`)
  }
  assert.ok(content.className.includes("overflow-hidden"), "안쪽 영역 자체는 스크롤하지 않는다")
  assert.equal(
    content.className.includes("overflow-y-auto"),
    false,
    "안쪽 영역이 다시 스크롤 상자가 되면 초점 이동이 내용 전체를 끌어내린다",
  )

  // 4) 안쪽 영역은 양피지 그림의 종이 면적 안으로 제한된다(inset 백분율 — 높이 기준).
  assert.ok(content.className.includes("inset-y-["), "세로 여백이 프레임 높이 기준이어야 한다")
  assert.ok(content.className.includes("inset-x-["))

  // 5) 초점은 모달 안(닫기 버튼)으로 들어오되, 그 버튼은 스크롤되지 않는 영역에 있다 —
  //    이것이 scrollTop 270 결함의 직접 원인이었다.
  assert.equal(document.activeElement, confirm)
  assert.equal(scroll.scrollTop, 0, "열자마자 목록은 맨 위(가장 새 알림)를 보여준다")
  assert.equal(rows[0].textContent.includes("알림 0"), true, "첫 행이 가장 새 알림이다")
})

test("AC-06(Chrome 회귀): 양피지 이미지가 실패한 대체 패널에서도 같은 3단 구조를 유지한다", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => manyNotifications(6) })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  act(() => {
    view.container
      .querySelector('img[aria-hidden="true"]')
      .dispatchEvent(new dom.window.Event("error", { bubbles: false }))
  })
  assert.ok(view.container.querySelector('[data-parchment-fallback="true"]'), "대체 패널로 전환된다")

  const content = view.container.querySelector('[data-parchment-content="true"]')
  const scroll = view.container.querySelector("[data-notification-scroll]")
  assert.equal(view.container.querySelector("[data-notification-heading]").parentElement, content)
  assert.equal(view.container.querySelector('[aria-label="닫기"]').parentElement, content)
  assert.equal(scroll.parentElement, content)
  assert.equal(view.container.querySelectorAll("[data-notification-id]").length, 6)
  // 높이가 내용으로 정해지는 대체 패널에서는 flex-1(basis:0)이면 목록이 0으로 접힌다.
  assert.ok(scroll.className.includes("flex-auto"))
  assert.ok(content.className.includes("max-h-[80svh]"), "대체 패널도 화면을 넘지 않는다")
  assert.ok(content.className.includes("overflow-hidden"))
})

test("AC-06(Chrome 회귀): 짧은 상태(로딩·실패·빈 상태)는 가운데 정렬을 유지하고 닫기는 그대로다", async (t) => {
  let calls = 0
  __setNotificationsApiForTests({
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

test("AC-06(Chrome 회귀): 알림 전용 치수는 다른 파치먼트 모달을 건드리지 않는다", () => {
  const notifications = INGAME_PARCHMENT_MODAL_VARIANTS.notifications
  assert.ok(notifications.parchmentContentBaseClass, "알림만 자기 안쪽 영역 치수를 갖는다")
  assert.ok(notifications.parchmentFallbackContentBaseClass)
  assert.ok(notifications.confirmButtonClass.includes("shrink-0"))

  for (const key of ["roleReveal", "phaseEntrance", "nightTurn", "nightPrivateResult"]) {
    const variant = INGAME_PARCHMENT_MODAL_VARIANTS[key]
    assert.equal(variant.parchmentContentBaseClass, undefined, `${key}는 공용 기본값을 그대로 쓴다`)
    assert.equal(variant.parchmentFallbackContentBaseClass, undefined, key)
  }
})

// ---------------------------------------------------------------------------
// AC-02: 열람·이동·읽음
// ---------------------------------------------------------------------------

test("AC-02: 모달을 여는 것만으로는 아무것도 읽음 처리되지 않는다", async (t) => {
  let patchCalls = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [notification({ id: "n1" }), notification({ id: "n2", sourceKey: "s2" })],
    markNotificationReadApi: async () => { patchCalls += 1 },
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  assert.equal(patchCalls, 0)
  assert.equal(view.container.querySelectorAll('[data-notification-read="false"]').length, 2)
})

test("AC-02: 열람은 그 항목만 읽음으로 바꾸고 미확인 표시가 사라진다", async (t) => {
  const rows = [
    notification({ id: "n1", createdAt: "2026-09-13T00:00:02.000Z" }),
    notification({ id: "n2", sourceKey: "s2", createdAt: "2026-09-13T00:00:01.000Z" }),
  ]
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => rows,
    markNotificationReadApi: async (id) => ({ ...rows.find((r) => r.id === id), readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  const firstItem = view.container.querySelector('[data-notification-id="n1"]')
  const readButton = firstItem.querySelector('[data-notification-action="read"]')
  await act(async () => {
    readButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  assert.equal(
    view.container.querySelector('[data-notification-id="n1"]').getAttribute("data-notification-read"),
    "true",
  )
  assert.equal(
    view.container.querySelector('[data-notification-id="n2"]').getAttribute("data-notification-read"),
    "false",
    "다른 항목까지 읽음 처리하면 안 된다",
  )
  assert.equal(view.container.querySelector('[data-notification-id="n1"] [data-notification-unread]'), null)
})

test("AC-02/A-06: 읽음이 실패하면 오류·재시도가 보이고 이동하지 않는다", async (t) => {
  let shouldFail = true
  const row = notification({ id: "n1", type: "achievement", sourceKey: "achievement:noble-win-10:granted", target: { kind: "achievement", achievementId: "noble-win-10" } })
  __setNotificationsApiForTests({
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

  // 재시도가 성공하면 읽음이 확정된다.
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
  __setNotificationsApiForTests({
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
    view.container
      .querySelector('[data-notification-action="open-target"]')
      .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  assert.deepEqual(navigated, ["/lobby?notificationRequestId=42"])
})

test("AC-02: 해석할 수 없는 대상에는 이동 버튼 자체가 없다(임의 URL로 나가지 않는다)", async (t) => {
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [
      notification({ id: "weird", target: { kind: "external", url: "https://example.com" } }),
    ],
  })
  await act(async () => { await useNotificationsStore.getState().loadSnapshot() })

  const view = mount(React.createElement(NotificationModal, { open: true, onClose: () => {} }))
  t.after(view.unmount)

  assert.equal(view.container.querySelector('[data-notification-action="open-target"]'), null)
  assert.ok(view.container.querySelector('[data-notification-action="read"]'), "열람은 여전히 가능하다")
})

// ---------------------------------------------------------------------------
// AC-06: 닫기 경로
// ---------------------------------------------------------------------------

test("AC-06: 확인 버튼·backdrop·Escape 모두 닫기를 부르고, 조회 실패 중에도 닫힌다", async (t) => {
  __setNotificationsApiForTests({
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
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification({ id: "a-only" })] })
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

// ---------------------------------------------------------------------------
// AC-01/AC-04: 진입 버튼의 미확인 표시
// ---------------------------------------------------------------------------

test("AC-01: 진입 버튼의 미확인 수가 실제 목록을 따라 갱신된다", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })
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
  __setNotificationsApiForTests({
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

// ---------------------------------------------------------------------------
// AC-02: 대상 해석(순수 매핑)
// ---------------------------------------------------------------------------

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
  // 기본(0번) 직업이 아닌 마녀사냥꾼도 정확한 jobIndex로 간다.
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
