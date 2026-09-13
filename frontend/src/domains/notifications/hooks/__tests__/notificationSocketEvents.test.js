import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// F-17 알림 수신 훅의 **실제 접속 수명** 시험(R-IMPL #1/#5).
//
// 이 파일은 수신 분기를 복제하지 않는다 — 실제 useNotificationSocketEvents를 실제 React
// 루트에 마운트하고, 실제 notifications store와 실제 F-16 재생기(dispatchSfxEvent가 쓰는
// 활성 재생기)를 그대로 쓴다. 시험이 소유하는 것은 **외부 자원뿐**이다:
//   - 네트워크(api 모듈 주입)
//   - 소켓 전송(connect/disconnect/ACK를 직접 일으키는 대역)
//   - 매체와 타이머(재생기·ACK timeout)
//
// 중요(A-07): "재생됐다"를 확인하는 대목은 **시험 전용 승인 fixture**와 가짜 매체를 쓴다.
// 실제 배포 manifest의 system-notification은 여전히 미검토이며, 이 기록은 실제 청음 증거가
// 아니다.
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
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = (await import("react")).default
const { act } = await import("react")
const { createRoot } = await import("react-dom/client")

const {
  useNotificationSocketEvents,
  __setNotificationTimersForTests,
  READY_MAX_ATTEMPTS,
} = await import("../useNotificationSocketEvents.js")
const {
  useNotificationsStore,
  __setNotificationsApiForTests,
} = await import("../../store/notifications.store.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useSettingsStore, buildDefaultGeneralChecks, buildDefaultSoundVolumes, SFX_MUTED_DEFAULT } =
  await import("../../../settings/store/settingsStore.js")
const { __setSfxPlayerForTests, useSfxRuntime } = await import("../../../../shared/hooks/useSfxRuntime.js")
const { setSocket } = await import("../../../../shared/socket/socketClient.js")
const { createSfxPlayer } = await import("../../../../shared/audio/sfxPlayer.js")
const { SFX_REVIEW_STATUS, SFX_CLASSIFICATION, SFX_SCOPE } = await import(
  "../../../../shared/audio/sfxManifest.js"
)

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111"
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222"
const SYSTEM_SOURCE_KEY = "system:notifications-available:v1"

function notification(overrides = {}) {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    type: "system",
    sourceKey: SYSTEM_SOURCE_KEY,
    title: "알림 기능 안내",
    body: "본문",
    target: { kind: "settings" },
    createdAt: "2026-09-13T00:00:00.000Z",
    readAt: null,
    ...overrides,
  }
}

function systemEnvelope(row, accountId = ACCOUNT_A) {
  return { kind: "system-notification", eventId: `notification:${row.id}`, accountId, origin: "live" }
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

/** 실제 Socket.IO 객체를 대신하는 전송 대역. connect/disconnect/ACK를 시험이 직접 일으킨다. */
function createFakeSocket({ connected = true } = {}) {
  const listeners = new Map()
  const emits = []
  const socket = {
    connected,
    on(event, listener) {
      const current = listeners.get(event) ?? []
      current.push(listener)
      listeners.set(event, current)
      return socket
    },
    off(event, listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter((candidate) => candidate !== listener))
      return socket
    },
    emit(event, payload, ack) {
      emits.push({ event, payload, ack })
      return socket
    },
    __fire(event, ...args) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(...args)
    },
    __listenerCount(event) {
      return (listeners.get(event) ?? []).length
    },
    __readyEmits() {
      return emits.filter((entry) => entry.event === "notifications_ready")
    },
    __emits: emits,
  }
  return socket
}

/** ACK timeout을 실시간으로 기다리지 않기 위한 수동 타이머. */
function createManualTimers() {
  const pending = new Map()
  let sequence = 0
  return {
    setTimeout(fn) {
      sequence += 1
      pending.set(sequence, fn)
      return sequence
    },
    clearTimeout(id) {
      pending.delete(id)
    },
    /** 지금 대기 중인 타이머를 모두 발火시킨다(발화 중 새로 생긴 것은 다음 호출에서). */
    flush() {
      const entries = [...pending.values()]
      pending.clear()
      for (const fn of entries) fn()
    },
    get size() {
      return pending.size
    },
  }
}

/** 시험 전용 승인 fixture — 배포 자산 검토도, 실제 청음도 아니다. */
function approvedSystemManifest() {
  return {
    "system-notification": {
      scope: SFX_SCOPE.ACCOUNT,
      notificationKey: "system-notification",
      reviewStatus: SFX_REVIEW_STATUS.APPROVED,
      silenceReason: null,
      source: "fixture",
      creator: "fixture",
      usageTerms: "fixture-only",
      sha256: "sha256-f17-fixture-ok",
      src: "/fixture/system-notification.wav",
      durationMs: 400,
      classification: SFX_CLASSIFICATION.SHORT_NON_MUSICAL,
    },
    // 업적 소리는 F-16의 기존 소비처(useSfxRuntime)가 소유한다. 복원 경계가 그 경로까지
    // 실제로 막는지 확인하려면 fixture에도 승인 항목이 있어야 한다 — 없으면 재생기가
    // "모르는 kind"로 먼저 거부해서, 경계가 깨져 있어도 시험이 통과해 버린다.
    "achievement-granted": {
      scope: SFX_SCOPE.ACCOUNT,
      notificationKey: "system-notification",
      reviewStatus: SFX_REVIEW_STATUS.APPROVED,
      silenceReason: null,
      source: "fixture",
      creator: "fixture",
      usageTerms: "fixture-only",
      sha256: "sha256-f17-fixture-achievement",
      src: "/fixture/achievement-granted.wav",
      durationMs: 400,
      classification: SFX_CLASSIFICATION.SHORT_NON_MUSICAL,
    },
  }
}

/**
 * 실제 F-16 재생기를 만들어 dispatchSfxEvent의 활성 재생기로 설치한다 — 훅은 자기 코드
 * 그대로 dispatchSfxEvent를 부르고, 우리는 매체 수준에서 재생 시도를 기록한다.
 */
function installRecordingPlayer(t) {
  const playCalls = []
  const created = []
  const player = createSfxPlayer({
    manifest: approvedSystemManifest(),
    getSettings: () => {
      const settings = useSettingsStore.getState()
      return {
        masterVolume: settings.volumes?.["master-volume"],
        sfxVolume: settings.volumes?.["sfx-volume"],
        sfxMuted: settings.sfxMuted === true,
        notifications: settings.generalChecks ?? {},
      }
    },
    getScope: () => {
      const auth = useAuthStore.getState()
      return {
        accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
        gameId: null,
        roomId: null,
      }
    },
    loadAsset: async (entry) => ({ sha256: entry.sha256, src: entry.src }),
    createMedia: (src) => {
      created.push(src)
      return {
        src,
        volume: 1,
        muted: false,
        play() {
          playCalls.push(src)
          return Promise.resolve()
        },
        pause() {},
        addEventListener() {},
        removeEventListener() {},
      }
    },
    now: () => 0,
    setTimer: () => 0,
    clearTimer: () => {},
  })
  __setSfxPlayerForTests(player)
  t.after(() => {
    __setSfxPlayerForTests(null)
    player.dispose()
  })
  return { playCalls, created }
}

function Harness({ socket }) {
  useNotificationSocketEvents(socket)
  return null
}

/**
 * 알림 수신 훅과 **기존 업적 소리의 실제 소유자**(useSfxRuntime)를 함께 마운트한다.
 *
 * 복원 경계의 구멍은 알림 훅이 아니라 이 경로로 드러난다 — 알림 훅의 notification_created는
 * 복원 전이면 receiveLiveNotification이 버퍼로 돌려보내 소리까지 가지도 않지만,
 * useSfxRuntime의 achievement_granted는 store의 consumeSoundEvent만 통과하면 바로
 * dispatchSfxEvent로 간다. 그래서 핸들러를 복제하지 않고 실제 훅을 마운트한다.
 *
 * useSfxRuntime은 socketClient 싱글턴에서 소켓을 읽으므로, 호출부가 setSocket으로 같은
 * 대역 소켓을 꽂아 준다(주입하는 것은 전송뿐이다).
 */
function RuntimeHarness({ socket }) {
  useNotificationSocketEvents(socket)
  useSfxRuntime()
  return null
}

const achievementEnvelope = (eventId, accountId = ACCOUNT_A) => ({
  kind: "achievement-granted",
  eventId,
  accountId,
  origin: "live",
})

function mount(element) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return {
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

/** 마운트 직후의 비동기 복원(GET → set)이 정착할 때까지 흘려보낸다. */
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const readyState = () => useNotificationsStore.getState().readyState
const items = () => useNotificationsStore.getState().items

let timers

test.beforeEach(() => {
  timers = createManualTimers()
  __setNotificationTimersForTests(timers)
  __setNotificationsApiForTests(null)
  __setSfxPlayerForTests(null)
  useNotificationsStore.getState().__resetForTests()
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT_A }, loggedOutIntentionally: false })
  useSettingsStore.setState({
    generalChecks: buildDefaultGeneralChecks(),
    volumes: buildDefaultSoundVolumes(),
    sfxMuted: SFX_MUTED_DEFAULT,
  })
  document.body.innerHTML = ""
})

test.afterEach(() => {
  __setNotificationTimersForTests(null)
  __setNotificationsApiForTests(null)
  __setSfxPlayerForTests(null)
})

// ---------------------------------------------------------------------------
// 접속 수명(R-IMPL #1)
// ---------------------------------------------------------------------------

test("AC-07/R-IMPL#1: GET이 connect보다 먼저 끝나도 이후 실제 connect에서 ready를 보낸다", async (t) => {
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      fetches += 1
      return []
    },
  })

  const socket = createFakeSocket({ connected: false })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)

  await settle()

  assert.equal(fetches, 1, "리스너 등록 뒤 복원은 connect를 기다리지 않는다")
  assert.equal(socket.__readyEmits().length, 0, "연결되지 않은 소켓으로 ready를 보내면 안 된다")
  assert.equal(readyState(), "retry", "재시도 상태로 남아야 한다")

  // 이제 실제로 연결된다 — 예전 구현은 여기서 아무 일도 하지 않아 시스템 안내 생성이
  // 영구히 누락됐다.
  socket.connected = true
  await act(async () => {
    socket.__fire("connect")
  })

  const emits = socket.__readyEmits()
  assert.equal(emits.length, 1, "connect가 준비 신호를 이어받아야 한다")
  assert.equal(fetches, 1, "같은 접속이므로 목록을 다시 받지 않는다")

  await act(async () => {
    emits[0].ack({ ok: true, created: true })
  })
  assert.equal(readyState(), "sent")
})

test("AC-07/R-IMPL#1: 같은 소켓의 disconnect→connect는 한 접속당 한 번 재동기화하고 ready를 다시 보낸다", async (t) => {
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      fetches += 1
      return [notification()]
    },
  })

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  assert.equal(fetches, 1)
  assert.equal(socket.__readyEmits().length, 1)
  await act(async () => socket.__readyEmits()[0].ack({ ok: true, created: true }))
  assert.equal(readyState(), "sent")

  await act(async () => {
    socket.connected = false
    socket.__fire("disconnect", "transport close")
  })
  assert.equal(readyState(), "retry", "끊긴 접속의 준비 상태를 sent로 두면 안 된다")
  assert.equal(items().length, 1, "이미 받아 둔 목록은 유지한다")

  await act(async () => {
    socket.connected = true
    socket.__fire("connect")
  })
  await settle()

  assert.equal(fetches, 2, "실제 재접속은 목록을 다시 동기화한다")
  assert.equal(socket.__readyEmits().length, 2, "새 접속에서 준비 신호를 다시 보낸다")

  await act(async () => socket.__readyEmits()[1].ack({ ok: true, created: false }))
  assert.equal(readyState(), "sent")
})

test("R-IMPL#1: 이전 접속의 늦은 ACK는 현재 접속의 준비 상태를 바꾸지 않는다", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  const staleAck = socket.__readyEmits()[0].ack

  await act(async () => {
    socket.connected = false
    socket.__fire("disconnect", "transport close")
    socket.connected = true
    socket.__fire("connect")
  })
  await settle()
  assert.equal(socket.__readyEmits().length, 2)

  // 끊긴 접속에서 보냈던 ready의 ACK가 이제야 도착한다. 현재 접속은 아직 자기 ACK를
  // 기다리는 중(pending)이어야 하고, 이전 접속의 성공으로 sent가 되면 안 된다.
  await act(async () => staleAck({ ok: true, created: true }))
  assert.equal(readyState(), "pending", "이전 접속의 ACK로 현재 접속을 sent로 만들면 안 된다")

  await act(async () => socket.__readyEmits()[1].ack({ ok: true, created: false }))
  assert.equal(readyState(), "sent")
})

test("R-IMPL#1: 이전 접속에서 늦게 끝난 복원은 현재 접속의 ready를 다시 보내지 않는다", async (t) => {
  const slow = deferred()
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: () => {
      fetches += 1
      return fetches === 1 ? slow.promise : Promise.resolve([])
    },
  })

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  assert.equal(socket.__readyEmits().length, 0, "복원이 끝나기 전에는 ready를 보내지 않는다")

  await act(async () => {
    socket.connected = false
    socket.__fire("disconnect", "transport close")
    socket.connected = true
    socket.__fire("connect")
  })
  await settle()
  assert.equal(fetches, 2)
  assert.equal(socket.__readyEmits().length, 1, "현재 접속의 복원만 ready를 만든다")

  // 이제서야 이전 접속의 GET이 끝난다.
  await act(async () => {
    slow.resolve([notification({ id: "from-old-connection" })])
    await slow.promise
  })
  assert.equal(socket.__readyEmits().length, 1, "이전 접속의 복원 완료가 ready를 또 보내면 안 된다")
})

test("AC-07: ACK가 오지 않으면 제한 시간 뒤 다시 보내고 상한에서 멈춘다(무한 재시도 없음)", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  assert.equal(socket.__readyEmits().length, 1)

  for (let attempt = 2; attempt <= READY_MAX_ATTEMPTS; attempt += 1) {
    await act(async () => timers.flush())
    assert.equal(socket.__readyEmits().length, attempt, `timeout 뒤 ${attempt}번째 시도`)
  }

  await act(async () => timers.flush())
  assert.equal(socket.__readyEmits().length, READY_MAX_ATTEMPTS, "상한을 넘어 계속 보내면 안 된다")
  assert.equal(readyState(), "retry")
  assert.equal(timers.size, 0, "대기 중인 timeout이 남으면 안 된다")
})

test("AC-07: ACK가 ok:false면 재시도하되 상한을 넘지 않는다", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  let guard = 0
  while (socket.__readyEmits().length > guard && guard < 10) {
    const entry = socket.__readyEmits()[guard]
    guard += 1
    await act(async () => entry.ack({ ok: false, reason: "STALE_SOCKET" }))
  }

  assert.equal(socket.__readyEmits().length, READY_MAX_ATTEMPTS)
  assert.equal(readyState(), "retry")
  assert.equal(timers.size, 0)
})

test("AC-07: GET 실패는 ready를 보내지 않고, 사용자 재시도 성공이 그 경계를 이어받는다", async (t) => {
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      fetches += 1
      if (fetches === 1) throw new Error("조회 실패")
      return [notification()]
    },
  })

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  assert.equal(useNotificationsStore.getState().status, "error")
  assert.equal(socket.__readyEmits().length, 0, "복원 실패에 준비 신호를 보내면 안 된다")
  assert.equal(readyState(), "retry")

  // 모달의 "다시 시도"가 부르는 것과 같은 실제 경로.
  await act(async () => {
    await useNotificationsStore.getState().loadSnapshot()
  })

  assert.equal(socket.__readyEmits().length, 1, "재시도 성공이 준비 신호를 보낸다")
})

test("R-IMPL#1: 언마운트는 리스너와 대기 중인 ACK timeout을 모두 정리한다", async () => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  await settle()

  assert.equal(socket.__listenerCount("notification_created"), 1)
  assert.equal(socket.__listenerCount("connect"), 1)
  assert.equal(socket.__listenerCount("disconnect"), 1)
  assert.ok(timers.size > 0, "ACK timeout이 걸려 있어야 한다")

  view.unmount()

  assert.equal(socket.__listenerCount("notification_created"), 0)
  assert.equal(socket.__listenerCount("connect"), 0)
  assert.equal(socket.__listenerCount("disconnect"), 0)
  assert.equal(timers.size, 0, "언마운트가 timeout을 남기면 안 된다")

  // 정리 뒤 사건이 도착해도 상태를 건드리지 않는다.
  socket.__fire("notification_created", { notification: notification({ id: "after-unmount" }) })
  assert.equal(items().some((item) => item.id === "after-unmount"), false)
})

test("A-05: 소켓 객체가 교체되면 이전 소켓에서 떼고 새 소켓으로 다시 동기화한다", async (t) => {
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      fetches += 1
      return []
    },
  })

  const first = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket: first }))
  t.after(view.unmount)
  await settle()
  assert.equal(fetches, 1)

  const second = createFakeSocket({ connected: true })
  view.rerender(React.createElement(Harness, { socket: second }))
  await settle()

  assert.equal(first.__listenerCount("notification_created"), 0)
  assert.equal(second.__listenerCount("notification_created"), 1)
  assert.equal(fetches, 2, "새 소켓은 새 접속이므로 다시 동기화한다")
  assert.equal(second.__readyEmits().length, 1)
})

test("A-05: 계정이 A→B로 바뀌면 목록을 비우고 다시 동기화하며, A 표시가 붙은 봉투는 재생 0회다", async (t) => {
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      fetches += 1
      return fetches === 1 ? [notification({ id: "a-only" })] : []
    },
  })
  const { playCalls } = installRecordingPlayer(t)

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()
  assert.equal(items().length, 1)

  await act(async () => {
    // 로그아웃 없이 곧바로 B로 바뀐다(isLoggedIn은 계속 true).
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT_B }, loggedOutIntentionally: false })
  })
  await settle()

  assert.equal(useNotificationsStore.getState().accountId, ACCOUNT_B)
  assert.equal(items().length, 0, "A의 목록이 B 화면에 남으면 안 된다")
  assert.equal(fetches, 2, "새 계정으로 구독·복원을 다시 시작한다")

  // 서버가 A 계정이라고 표시한 봉투는 이 화면(B)에서 소리가 되지 않는다.
  const row = notification({ id: "labelled-for-a" })
  await act(async () => {
    socket.__fire("notification_created", { notification: row, sfxEvent: systemEnvelope(row, ACCOUNT_A) })
  })
  await settle()
  assert.equal(playCalls.length, 0, "봉투의 계정이 현재 계정과 다르면 재생하지 않는다")
})

// ---------------------------------------------------------------------------
// F-16 연결(AC-07) — 실제 훅 → dispatchSfxEvent → 실제 재생기
// ---------------------------------------------------------------------------

test("AC-07: 실제 훅이 받은 최초 live 시스템 알림만 재생되고 재전달은 0회다", async (t) => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })
  const { playCalls } = installRecordingPlayer(t)

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  const row = notification({ id: "sys-live" })
  const payload = { notification: row, sfxEvent: systemEnvelope(row) }

  await act(async () => socket.__fire("notification_created", payload))
  await settle()

  assert.equal(items().length, 1)
  assert.equal(playCalls.length, 1, "최초 live는 한 번 재생 후보가 된다")

  await act(async () => {
    socket.__fire("notification_created", payload)
    socket.__fire("notification_created", { ...payload })
  })
  await settle()
  assert.equal(items().length, 1, "같은 행이 늘어나면 안 된다")
  assert.equal(playCalls.length, 1, "재전달은 추가 재생 0회")
})

test("AC-07: 복원·재접속 동기화 중 도착한 사건과 복원된 사건의 늦은 live는 재생 0회다", async (t) => {
  const row = notification({ id: "sys-restored" })
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      fetches += 1
      return [row]
    },
  })
  const { playCalls } = installRecordingPlayer(t)

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  assert.equal(fetches, 1)
  assert.equal(playCalls.length, 0, "복원은 소리를 만들지 않는다")

  // 복원으로 본 사건이 나중에 live로 늦게 도착해도 무음이다.
  await act(async () => socket.__fire("notification_created", { notification: row, sfxEvent: systemEnvelope(row) }))
  await settle()
  assert.equal(playCalls.length, 0)

  // 재접속: 재동기화 중 같은 사건이 다시 전달돼도 무음이고, 동기화 후에도 무음이다.
  await act(async () => {
    socket.connected = false
    socket.__fire("disconnect", "transport close")
    socket.connected = true
    socket.__fire("connect")
    socket.__fire("notification_created", { notification: row, sfxEvent: systemEnvelope(row) })
  })
  await settle()
  assert.equal(playCalls.length, 0, "재접속 재동기화는 재생 0회")
  assert.equal(items().length, 1)
})

test("AC-07/R-IMPL#5: 재동기화 중 도착한 새 사건은 복원으로 취급해 무음이고, 목록에는 남는다", async (t) => {
  const slow = deferred()
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: () => {
      fetches += 1
      return fetches === 1 ? Promise.resolve([]) : slow.promise
    },
  })
  const { playCalls } = installRecordingPlayer(t)

  const socket = createFakeSocket({ connected: true })
  const view = mount(React.createElement(Harness, { socket }))
  t.after(view.unmount)
  await settle()

  // 재접속 — 두 번째 GET은 아직 끝나지 않는다.
  await act(async () => {
    socket.connected = false
    socket.__fire("disconnect", "transport close")
    socket.connected = true
    socket.__fire("connect")
  })

  const row = notification({ id: "during-resync" })
  await act(async () => socket.__fire("notification_created", { notification: row, sfxEvent: systemEnvelope(row) }))
  await settle()
  assert.equal(playCalls.length, 0, "재동기화 구간의 사건은 복원 경계 안이다")

  await act(async () => {
    slow.resolve([])
    await slow.promise
  })
  await settle()

  assert.equal(items().some((item) => item.id === "during-resync"), true, "무음이어도 목록에는 남는다")
  assert.equal(playCalls.length, 0)
})

test("CODEX-2: 초기 복원이 실패로 끝나도 늦게 배달된 과거 업적 사건은 실제 재생기까지 가지 않는다", async (t) => {
  const OLD_KEY = "achievement:noble-win-10:granted"
  const NEW_KEY = "achievement:record-1-masquerade:granted"

  const first = deferred()
  let fetches = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: () => {
      fetches += 1
      // 1회차는 실패한다. 2회차(화면의 재시도)는 **그 과거 업적이 담긴** 목록을 준다.
      if (fetches === 1) return first.promise
      return Promise.resolve([
        notification({
          id: "restored-achievement",
          type: "achievement",
          sourceKey: OLD_KEY,
          target: { kind: "achievement", achievementId: "noble-win-10" },
          createdAt: "2026-09-12T00:00:00.000Z",
        }),
      ])
    },
  })

  const socket = createFakeSocket({ connected: true })
  // useSfxRuntime은 socketClient에서 소켓을 읽는다 — 전송만 꽂아 준다.
  setSocket(socket)

  const view = mount(React.createElement(RuntimeHarness, { socket }))
  // 먼저 언마운트한 뒤 싱글턴을 비운다 — 순서가 반대면 아직 마운트된 useSyncExternalStore가
  // act 밖에서 갱신된다.
  t.after(() => {
    view.unmount()
    act(() => setSocket(null))
  })

  // useSfxRuntime의 effect가 진짜 재생기를 설치한 **뒤에** 기록용 재생기로 갈아끼운다
  // (sfxUiOwnership.test.js와 같은 순서).
  const { playCalls } = installRecordingPlayer(t)

  await act(async () => {
    first.reject(new Error("조회 실패"))
    await first.promise.catch(() => {})
  })
  await settle()

  assert.equal(useNotificationsStore.getState().status, "error")

  // 예전 구현은 여기서 경계를 내려, 서버 목록을 한 번도 받지 못한 채 **과거** 지급이 울렸다.
  // 들리는 결과부터 확인한다 — 내부 플래그가 아니라 이것이 AC-07이 금지하는 회귀다.
  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(OLD_KEY) }))
  await settle()
  assert.deepEqual(playCalls, [], "복원이 해소되지 않은 동안 과거 업적 사건은 무음이다")
  assert.equal(
    useNotificationsStore.getState().restorePending,
    true,
    "실패한 조회는 복원을 해소하지 못한다",
  )

  // 늦게 반복 배달돼도 마찬가지다(표식을 소모하지 않았으므로 상태도 그대로).
  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(OLD_KEY) }))
  await settle()
  assert.deepEqual(playCalls, [])

  // 읽음·닫기·재시도는 잠기지 않는다 — 경계는 소리 적격성에만 쓰인다.
  await act(async () => {
    await useNotificationsStore.getState().loadSnapshot()
  })
  await settle()
  assert.equal(fetches, 2)
  assert.equal(useNotificationsStore.getState().status, "success")
  assert.equal(useNotificationsStore.getState().restorePending, false, "성공한 복원만 경계를 해소한다")

  // 복원이 담고 있던 과거 지급은 해소 뒤에도 계속 무음이다.
  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(OLD_KEY) }))
  await settle()
  assert.deepEqual(playCalls, [], "복원에 담긴 과거 지급은 재시도 성공 뒤에도 무음이다")

  // 대조: 경계가 모든 것을 삼키지는 않는다. 복원 뒤의 진짜 새 지급은 최초 1회 울린다.
  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(NEW_KEY) }))
  await settle()
  assert.equal(playCalls.length, 1, "복원이 해소된 뒤의 새 지급은 한 번 울린다")

  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(NEW_KEY) }))
  await settle()
  assert.equal(playCalls.length, 1, "같은 새 지급의 재전달은 추가 0회")
})
