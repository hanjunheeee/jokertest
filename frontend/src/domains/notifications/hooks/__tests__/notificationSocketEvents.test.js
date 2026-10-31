import test from "node:test"
import assert from "node:assert/strict"
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
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT_B }, loggedOutIntentionally: false })
  })
  await settle()

  assert.equal(useNotificationsStore.getState().accountId, ACCOUNT_B)
  assert.equal(items().length, 0, "A의 목록이 B 화면에 남으면 안 된다")
  assert.equal(fetches, 2, "새 계정으로 구독·복원을 다시 시작한다")

  const row = notification({ id: "labelled-for-a" })
  await act(async () => {
    socket.__fire("notification_created", { notification: row, sfxEvent: systemEnvelope(row, ACCOUNT_A) })
  })
  await settle()
  assert.equal(playCalls.length, 0, "봉투의 계정이 현재 계정과 다르면 재생하지 않는다")
})

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

  await act(async () => socket.__fire("notification_created", { notification: row, sfxEvent: systemEnvelope(row) }))
  await settle()
  assert.equal(playCalls.length, 0)

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
  setSocket(socket)

  const view = mount(React.createElement(RuntimeHarness, { socket }))
  t.after(() => {
    view.unmount()
    act(() => setSocket(null))
  })

  const { playCalls } = installRecordingPlayer(t)

  await act(async () => {
    first.reject(new Error("조회 실패"))
    await first.promise.catch(() => {})
  })
  await settle()

  assert.equal(useNotificationsStore.getState().status, "error")

  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(OLD_KEY) }))
  await settle()
  assert.deepEqual(playCalls, [], "복원이 해소되지 않은 동안 과거 업적 사건은 무음이다")
  assert.equal(
    useNotificationsStore.getState().restorePending,
    true,
    "실패한 조회는 복원을 해소하지 못한다",
  )

  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(OLD_KEY) }))
  await settle()
  assert.deepEqual(playCalls, [])

  await act(async () => {
    await useNotificationsStore.getState().loadSnapshot()
  })
  await settle()
  assert.equal(fetches, 2)
  assert.equal(useNotificationsStore.getState().status, "success")
  assert.equal(useNotificationsStore.getState().restorePending, false, "성공한 복원만 경계를 해소한다")

  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(OLD_KEY) }))
  await settle()
  assert.deepEqual(playCalls, [], "복원에 담긴 과거 지급은 재시도 성공 뒤에도 무음이다")

  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(NEW_KEY) }))
  await settle()
  assert.equal(playCalls.length, 1, "복원이 해소된 뒤의 새 지급은 한 번 울린다")

  await act(async () => socket.__fire("achievement_granted", { sfxEvent: achievementEnvelope(NEW_KEY) }))
  await settle()
  assert.equal(playCalls.length, 1, "같은 새 지급의 재전달은 추가 0회")
})
