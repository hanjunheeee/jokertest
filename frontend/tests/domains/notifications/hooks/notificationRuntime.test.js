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

const {
  useNotificationsStore,
  mergeNotifications,
  selectVisibleNotifications,
  selectUnreadCount,
  isNotificationBackedSourceKey,
  isConfirmedReadRow,
  __setNotificationsApiForTests,
} = await import("../../../../src/domains/notifications/store/notifications.store.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { useSettingsStore, buildDefaultGeneralChecks, buildDefaultSoundVolumes, SFX_MUTED_DEFAULT } =
  await import("../../../../src/domains/settings/store/settingsStore.js")
const { createSfxPlayer } = await import("../../../../src/shared/audio/sfxPlayer.js")
const {
  SFX_MANIFEST,
  SFX_REVIEW_STATUS,
  SFX_CLASSIFICATION,
  SFX_SUPPRESSED_REASON,
  SFX_SCOPE,
  checkSfxAssetAllowed,
} = await import("../../../../src/shared/audio/sfxManifest.js")

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

function loginAs(uuid) {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid }, loggedOutIntentionally: false })
  useNotificationsStore.getState().syncAccount()
}

function logout() {
  useAuthStore.setState({ isLoggedIn: false, user: null, loggedOutIntentionally: true })
  useNotificationsStore.getState().syncAccount()
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0))
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

test.beforeEach(() => {
  __setNotificationsApiForTests(null)
  useNotificationsStore.getState().__resetForTests()
  useAuthStore.setState({ isLoggedIn: false, user: null, loggedOutIntentionally: false })
  useSettingsStore.setState({
    generalChecks: buildDefaultGeneralChecks(),
    volumes: buildDefaultSoundVolumes(),
    sfxMuted: SFX_MUTED_DEFAULT,
  })
})

test.afterEach(() => {
  __setNotificationsApiForTests(null)
})

test("A-04: union 병합은 기존 행을 지우지 않고 read_at을 null로 되돌리지 않는다", () => {
  const live = notification({ id: "id-live", sourceKey: "friend-request:9:received" })
  const readLocally = notification({ id: "id-read", readAt: "2026-09-13T01:00:00.000Z" })

  const staleSnapshot = [notification({ id: "id-read", readAt: null })]

  const merged = mergeNotifications([live, readLocally], staleSnapshot)

  assert.equal(merged.length, 2, "오래된 GET이 그 사이 도착한 live 행을 없애면 안 된다")
  assert.equal(
    merged.find((item) => item.id === "id-read").readAt,
    "2026-09-13T01:00:00.000Z",
    "오래된 GET이 읽음을 미확인으로 되돌리면 안 된다",
  )
})

test("A-04: 양쪽에 read_at이 있으면 먼저 찍힌 시각을 유지한다(재시도가 읽음 시각을 뒤로 밀지 않는다)", () => {
  const merged = mergeNotifications(
    [notification({ id: "x", readAt: "2026-09-13T01:00:00.000Z" })],
    [notification({ id: "x", readAt: "2026-09-13T02:00:00.000Z" })],
  )
  assert.equal(merged[0].readAt, "2026-09-13T01:00:00.000Z")
})

test("AC-06: 조회 실패는 빈 목록이 아니라 error 상태로 남고, 재시도가 실제로 다시 조회한다", async () => {
  loginAs(ACCOUNT_A)

  let calls = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      calls += 1
      if (calls === 1) throw new Error("네트워크 실패")
      return [notification()]
    },
  })

  const first = await useNotificationsStore.getState().loadSnapshot()
  assert.equal(first.ok, false)
  assert.equal(useNotificationsStore.getState().status, "error")
  assert.equal(useNotificationsStore.getState().error, "네트워크 실패")
  assert.deepEqual(useNotificationsStore.getState().items, [], "실패는 목록을 만들지 않는다")

  const second = await useNotificationsStore.getState().loadSnapshot()
  assert.equal(second.ok, true)
  assert.equal(calls, 2, "재시도는 실제 GET을 다시 실행해야 한다")
  assert.equal(useNotificationsStore.getState().status, "success")
  assert.equal(useNotificationsStore.getState().items.length, 1)
})

test("A-04: 복원으로 본 사건은 소리 표식을 소모해, 나중에 같은 사건이 live로 와도 무음이다", async () => {
  loginAs(ACCOUNT_A)
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification()] })

  await useNotificationsStore.getState().loadSnapshot()

  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, SYSTEM_SOURCE_KEY),
    false,
    "복원에서 본 사건은 소리 후보가 아니다",
  )
})

test("A-04: 복원 전에 도착한 live는 버퍼에 모였다가 복원과 함께 무음으로 병합된다", async () => {
  loginAs(ACCOUNT_A)
  const early = notification({ id: "early", sourceKey: "friend-request:7:received", type: "friend-request" })

  const result = useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, early)
  assert.deepEqual(result, { applied: false, reason: "buffered" })

  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification()] })
  await useNotificationsStore.getState().loadSnapshot()

  const state = useNotificationsStore.getState()
  assert.equal(state.items.length, 2, "버퍼에 있던 사건도 목록에는 남는다")
  assert.equal(
    state.consumeSoundEvent(ACCOUNT_A, "friend-request:7:received"),
    false,
    "복원과 겹친 사건은 무음이어야 한다",
  )
})

test("R-IMPL#5: 복원이 진행 중이면 아직 못 본 업적·친구 수신 사건도 소리 후보가 아니다", async () => {
  loginAs(ACCOUNT_A)
  const slow = deferred()
  __setNotificationsApiForTests({ fetchNotificationsApi: () => slow.promise })

  const loading = useNotificationsStore.getState().loadSnapshot()

  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "achievement:record-1-masquerade:granted"),
    false,
    "복원 중 업적 사건은 복원 경계 안이다",
  )
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:11:received"),
    false,
    "복원 중 친구 수신 사건도 복원 경계 안이다",
  )

  slow.resolve([])
  await loading

  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "achievement:record-1-masquerade:granted"),
    true,
  )
})

test("R-IMPL#5: 알림 행이 없는 기존 친구 수락·거절 사건은 복원 중에도 최초 소리를 잃지 않는다", async () => {
  loginAs(ACCOUNT_A)
  const slow = deferred()
  __setNotificationsApiForTests({ fetchNotificationsApi: () => slow.promise })

  const loading = useNotificationsStore.getState().loadSnapshot()

  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:accepted"), true)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:declined"), true)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:accepted"), false)

  slow.resolve([])
  await loading
})

test("CODEX-2: 복원이 실패로 끝나도 알림 행 기반 사건은 소리 후보가 아니다", async () => {
  loginAs(ACCOUNT_A)
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      throw new Error("조회 실패")
    },
  })

  const result = await useNotificationsStore.getState().loadSnapshot()
  assert.equal(result.ok, false)
  assert.equal(useNotificationsStore.getState().snapshotLoaded, false)
  assert.equal(useNotificationsStore.getState().restorePending, true)

  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "achievement:noble-win-10:granted"),
    false,
    "조회 실패 후 과거 업적 사건을 최초 발생으로 인정하면 안 된다",
  )
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:77:received"),
    false,
    "조회 실패 후 과거 친구 수신 사건도 마찬가지다",
  )
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "achievement:noble-win-10:granted"),
    false,
  )
  assert.equal(useNotificationsStore.getState().soundSeen.size, 0)

  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:accepted"), true)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:declined"), true)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:accepted"), false)

  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [
      notification({
        id: "restored",
        type: "achievement",
        sourceKey: "achievement:noble-win-10:granted",
      }),
    ],
  })
  const retried = await useNotificationsStore.getState().loadSnapshot()
  assert.equal(retried.ok, true)
  assert.equal(useNotificationsStore.getState().restorePending, false)

  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "achievement:noble-win-10:granted"),
    false,
    "복원에 담긴 과거 사건은 재시도 성공 뒤에도 무음이다",
  )
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "system:notifications-available:v1"),
    true,
    "복원이 해소된 뒤의 진짜 새 사건은 한 번 울린다",
  )
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "system:notifications-available:v1"),
    false,
  )
})

test("R-IMPL#5: 복원 경계는 알림 행으로 남는 키 모양에만 적용된다", () => {
  assert.equal(isNotificationBackedSourceKey("system:notifications-available:v1"), true)
  assert.equal(isNotificationBackedSourceKey("friend-request:42:received"), true)
  assert.equal(isNotificationBackedSourceKey("achievement:record-1-masquerade:granted"), true)

  assert.equal(isNotificationBackedSourceKey("friend-request:42:accepted"), false)
  assert.equal(isNotificationBackedSourceKey("friend-request:42:declined"), false)
  assert.equal(isNotificationBackedSourceKey("ui-click:7"), false)
  assert.equal(isNotificationBackedSourceKey("game:1:day:2:round:1:actor:u:vote:1"), false)
  assert.equal(isNotificationBackedSourceKey(null), false)
})

test("AC-03: 같은 봉투를 live 전후·조회 전후로 반복해도 행이 늘지 않는다", async () => {
  loginAs(ACCOUNT_A)
  const row = notification({ id: "dup" })
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })
  await useNotificationsStore.getState().loadSnapshot()

  useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, row)
  useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, row)
  useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, { ...row })

  assert.equal(useNotificationsStore.getState().items.length, 1)
  assert.equal(selectUnreadCount(useNotificationsStore.getState().items, buildDefaultGeneralChecks()), 1)
})

test("AC-02: 읽음은 서버가 확정한 행으로만 반영되고 미확인 수가 줄어든다", async () => {
  loginAs(ACCOUNT_A)
  const a = notification({ id: "a", createdAt: "2026-09-13T00:00:02.000Z" })
  const b = notification({ id: "b", sourceKey: "achievement:noble-win-10:granted", type: "achievement", createdAt: "2026-09-13T00:00:01.000Z" })

  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [a, b],
    markNotificationReadApi: async (id) => ({
      ...(id === "a" ? a : b),
      readAt: "2026-09-13T03:00:00.000Z",
    }),
  })
  await useNotificationsStore.getState().loadSnapshot()

  const checks = buildDefaultGeneralChecks()
  assert.equal(selectUnreadCount(useNotificationsStore.getState().items, checks), 2)

  await useNotificationsStore.getState().markRead("a")
  assert.equal(selectUnreadCount(useNotificationsStore.getState().items, checks), 1)

  await useNotificationsStore.getState().markRead("b")
  assert.equal(selectUnreadCount(useNotificationsStore.getState().items, checks), 0)
})

test("AC-02: 읽음 실패는 성공으로 위장하지 않고 항목별 오류로 남는다", async () => {
  loginAs(ACCOUNT_A)
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [notification({ id: "a" })],
    markNotificationReadApi: async () => {
      throw new Error("읽음 서버 오류")
    },
  })
  await useNotificationsStore.getState().loadSnapshot()

  const result = await useNotificationsStore.getState().markRead("a")

  assert.equal(result.ok, false)
  assert.equal(useNotificationsStore.getState().readErrors.a, "읽음 서버 오류")
  assert.deepEqual(useNotificationsStore.getState().readPendingIds, [])
  assert.equal(
    selectUnreadCount(useNotificationsStore.getState().items, buildDefaultGeneralChecks()),
    1,
    "실패했는데 미확인 표시를 지우면 안 된다",
  )
})

const UNCONFIRMED_RESPONSES = [
  { label: "null 응답", make: () => null },
  { label: "undefined 응답", make: () => undefined },
  { label: "빈 객체", make: () => ({}) },
  { label: "다른 알림 id", make: () => notification({ id: "other", readAt: "2026-09-13T03:00:00.000Z" }) },
  { label: "readAt 없음", make: (id) => notification({ id, readAt: null }) },
  { label: "해석할 수 없는 readAt", make: (id) => notification({ id, readAt: "언제쯤" }) },
  { label: "readAt이 숫자", make: (id) => notification({ id, readAt: 0 }) },
]

for (const scenario of UNCONFIRMED_RESPONSES) {
  test(`AC-02/R-IMPL#2: ${scenario.label}은 성공이 아니라 항목별 오류로 남고 미확인 수가 유지된다`, async () => {
    loginAs(ACCOUNT_A)
    const row = notification({ id: "target" })
    __setNotificationsApiForTests({
      fetchNotificationsApi: async () => [row],
      markNotificationReadApi: async (id) => scenario.make(id),
    })
    await useNotificationsStore.getState().loadSnapshot()

    const result = await useNotificationsStore.getState().markRead("target")

    assert.equal(result.ok, false, scenario.label)
    assert.equal(result.reason, "unconfirmed")
    assert.ok(useNotificationsStore.getState().readErrors.target, "재시도할 수 있는 오류가 남아야 한다")
    assert.deepEqual(useNotificationsStore.getState().readPendingIds, [])
    assert.equal(
      selectUnreadCount(useNotificationsStore.getState().items, buildDefaultGeneralChecks()),
      1,
      "확정되지 않은 응답으로 미확인 표시를 지우면 안 된다",
    )
    assert.equal(
      useNotificationsStore.getState().items.some((item) => item.id === "other"),
      false,
      "요청하지 않은 다른 행을 병합하면 안 된다",
    )
  })
}

test("AC-02/R-IMPL#2: 확정되지 않은 응답 뒤 재시도가 성공하면 읽음이 확정된다", async () => {
  loginAs(ACCOUNT_A)
  const row = notification({ id: "retry-target" })
  let attempts = 0
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row],
    markNotificationReadApi: async (id) => {
      attempts += 1
      if (attempts === 1) return { ...row, readAt: null }
      return { ...row, id, readAt: "2026-09-13T03:00:00.000Z" }
    },
  })
  await useNotificationsStore.getState().loadSnapshot()

  assert.equal((await useNotificationsStore.getState().markRead("retry-target")).ok, false)
  useNotificationsStore.getState().clearReadError("retry-target")

  const second = await useNotificationsStore.getState().markRead("retry-target")
  assert.equal(second.ok, true)
  assert.equal(second.notification.readAt, "2026-09-13T03:00:00.000Z")
  assert.equal(selectUnreadCount(useNotificationsStore.getState().items, buildDefaultGeneralChecks()), 0)
  assert.deepEqual(useNotificationsStore.getState().readErrors, {})
})

test("R-IMPL#2: isConfirmedReadRow는 요청한 id와 확정된 read_at만 인정한다", () => {
  const ok = notification({ id: "x", readAt: "2026-09-13T03:00:00.000Z" })
  assert.equal(isConfirmedReadRow(ok, "x"), true)
  assert.equal(isConfirmedReadRow({ ...ok, readAt: new Date("2026-09-13T03:00:00.000Z") }, "x"), true)
  assert.equal(isConfirmedReadRow(ok, "y"), false)
  assert.equal(isConfirmedReadRow({ ...ok, readAt: null }, "x"), false)
  assert.equal(isConfirmedReadRow(null, "x"), false)
})

test("A-04: GET 시작 → live 수신 → 읽음 성공 → 오래된 GET 완료 순서에서도 항목과 읽음이 유지된다", async () => {
  loginAs(ACCOUNT_A)

  const persisted = notification({ id: "persisted" })
  const late = deferred()
  let fetchCount = 0

  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => {
      fetchCount += 1
      if (fetchCount === 2) return late.promise
      return [persisted]
    },
    markNotificationReadApi: async () => ({ ...persisted, readAt: "2026-09-13T03:00:00.000Z" }),
  })

  await useNotificationsStore.getState().loadSnapshot()

  const slow = useNotificationsStore.getState().loadSnapshot()

  const liveRow = notification({ id: "live", sourceKey: "friend-request:3:received", type: "friend-request" })
  useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, liveRow)
  await useNotificationsStore.getState().markRead("persisted")

  late.resolve([notification({ id: "persisted", readAt: null })])
  await slow

  const state = useNotificationsStore.getState()
  assert.ok(state.items.some((item) => item.id === "live"), "오래된 GET이 live 행을 없애면 안 된다")
  assert.ok(
    state.items.find((item) => item.id === "persisted").readAt,
    "오래된 GET이 읽음을 미확인으로 되돌리면 안 된다",
  )
})

test("A-05: 로그아웃하면 목록·미확인 수·소리 표식이 화면과 캐시에서 사라진다", async () => {
  loginAs(ACCOUNT_A)
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification()] })
  await useNotificationsStore.getState().loadSnapshot()
  assert.equal(useNotificationsStore.getState().items.length, 1)

  logout()

  const state = useNotificationsStore.getState()
  assert.deepEqual(state.items, [])
  assert.equal(state.accountId, null)
  assert.equal(state.status, "idle")
  assert.equal(state.open, false, "계정이 바뀌면 열려 있던 모달도 닫힌다")
  assert.equal(selectUnreadCount(state.items, buildDefaultGeneralChecks()), 0)
})

test("A-05: 로그인 boolean이 유지되는 A→B 직접 전환에서도 A의 목록이 남지 않는다", async () => {
  loginAs(ACCOUNT_A)
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [notification({ id: "a-only" })] })
  await useNotificationsStore.getState().loadSnapshot()

  loginAs(ACCOUNT_B)

  assert.deepEqual(useNotificationsStore.getState().items, [])
  assert.equal(useNotificationsStore.getState().accountId, ACCOUNT_B)
})

test("A-05: A의 지연 GET·PATCH는 B로 바뀐 뒤 도착해도 B의 목록을 건드리지 않는다", async () => {
  loginAs(ACCOUNT_A)

  const slowFetch = deferred()
  const slowPatch = deferred()
  __setNotificationsApiForTests({
    fetchNotificationsApi: () => slowFetch.promise,
    markNotificationReadApi: () => slowPatch.promise,
  })

  const fetching = useNotificationsStore.getState().loadSnapshot()
  const patching = useNotificationsStore.getState().markRead("aaaaaaaa-0000-4000-8000-000000000001")

  loginAs(ACCOUNT_B)

  slowFetch.resolve([notification({ id: "from-a" })])
  slowPatch.resolve(notification({ id: "from-a", readAt: "2026-09-13T03:00:00.000Z" }))
  assert.equal((await fetching).reason, "stale")
  assert.equal((await patching).reason, "stale")

  const state = useNotificationsStore.getState()
  assert.deepEqual(state.items, [], "A의 늦은 응답이 B의 목록에 들어오면 안 된다")
  assert.deepEqual(state.readErrors, {})
})

test("A-05: 다른 계정 앞으로 온 live 사건은 목록에도 소리에도 들어가지 않는다", async () => {
  loginAs(ACCOUNT_A)
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })
  await useNotificationsStore.getState().loadSnapshot()

  const applied = useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_B, notification())
  assert.equal(applied.applied, false)
  assert.equal(useNotificationsStore.getState().items.length, 0)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_B, SYSTEM_SOURCE_KEY), false)
})

test("AC-04: 설정을 꺼도 보관 목록은 그대로이고 표시·미확인 수에서만 빠진다", async () => {
  loginAs(ACCOUNT_A)
  const friend = notification({ id: "f", type: "friend-request", sourceKey: "friend-request:1:received" })
  const achievement = notification({ id: "ach", type: "achievement", sourceKey: "achievement:noble-win-10:granted" })
  const system = notification({ id: "sys" })

  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [friend, achievement, system] })
  await useNotificationsStore.getState().loadSnapshot()

  const items = () => useNotificationsStore.getState().items

  const allOn = buildDefaultGeneralChecks()
  assert.equal(selectVisibleNotifications(items(), allOn).length, 3)

  const friendOff = { ...allOn, "friend-invite": false }
  assert.equal(selectVisibleNotifications(items(), friendOff).length, 2)
  assert.equal(selectUnreadCount(items(), friendOff), 2)
  assert.equal(items().length, 3, "표시를 끈다고 보관 목록이 줄면 안 된다")

  const systemOff = { ...allOn, "system-notification": false }
  const visible = selectVisibleNotifications(items(), systemOff)
  assert.deepEqual(visible.map((item) => item.id), ["f"], "업적·시스템이 함께 숨는다")

  assert.equal(selectVisibleNotifications(items(), allOn).length, 3)
})

test("A-03: 숨긴 상태로 받은 사건도 소리 처리 이력은 소모되어, 설정을 다시 켜도 울리지 않는다", async () => {
  loginAs(ACCOUNT_A)
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => [] })
  await useNotificationsStore.getState().loadSnapshot()

  useSettingsStore.setState({
    generalChecks: { ...buildDefaultGeneralChecks(), "system-notification": false },
  })

  const row = notification({ id: "hidden" })
  useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, row)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, row.sourceKey), true)

  useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, row.sourceKey),
    false,
    "설정을 다시 켰다고 과거 사건이 새 사건이 되면 안 된다",
  )
})

const GOOD_HASH = "sha256-f17-fixture-ok"

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
      sha256: GOOD_HASH,
      src: "/fixture/system-notification.wav",
      durationMs: 400,
      classification: SFX_CLASSIFICATION.SHORT_NON_MUSICAL,
    },
  }
}

function createRecordingRuntime({ manifest, loadAsset } = {}) {
  const playCalls = []
  const created = []
  const timers = []

  const player = createSfxPlayer({
    manifest: manifest ?? approvedSystemManifest(),
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
    loadAsset: loadAsset ?? (async (entry) => ({ sha256: entry.sha256, src: entry.src })),
    createMedia: (src) => {
      created.push(src)
      const media = {
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
      return media
    },
    now: () => 0,
    setTimer: (fn) => {
      timers.push(fn)
      return timers.length
    },
    clearTimer: () => {},
  })

  return { player, playCalls, created, timers }
}

function receiveLiveEnvelope(player, accountId, payload) {
  const store = useNotificationsStore.getState()
  const applied = store.receiveLiveNotification(accountId, payload.notification)
  if (!applied.applied) return { dispatched: false, reason: applied.reason }

  const envelope = payload.sfxEvent
  if (envelope === null || envelope === undefined) return { dispatched: false, reason: "no-envelope" }
  if (envelope.accountId !== accountId) return { dispatched: false, reason: "account-mismatch" }
  if (envelope.origin !== "live") return { dispatched: false, reason: "not-live" }
  if (!useNotificationsStore.getState().consumeSoundEvent(accountId, payload.notification.sourceKey)) {
    return { dispatched: false, reason: "already-handled" }
  }
  const result = player.dispatch({
    kind: envelope.kind,
    eventId: envelope.eventId,
    accountId,
    origin: "live",
  })
  return { dispatched: true, result }
}

async function primeLoadedSnapshot(rows = []) {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => rows })
  await useNotificationsStore.getState().loadSnapshot()
}

test("AC-07: 승인 fixture에서 새 시스템 알림의 최초 live만 재생되고 중복 전달은 0회다", async (t) => {
  loginAs(ACCOUNT_A)
  await primeLoadedSnapshot([])
  const { player, playCalls } = createRecordingRuntime()
  t.after(() => player.dispose())

  const row = notification({ id: "sys-1" })
  const payload = { notification: row, sfxEvent: systemEnvelope(row) }

  const first = receiveLiveEnvelope(player, ACCOUNT_A, payload)
  assert.equal(first.dispatched, true)
  assert.equal(first.result.status, "accepted")
  await flushAsync()
  assert.equal(playCalls.length, 1)

  assert.equal(receiveLiveEnvelope(player, ACCOUNT_A, payload).reason, "already-handled")
  assert.equal(receiveLiveEnvelope(player, ACCOUNT_A, { ...payload }).reason, "already-handled")
  await flushAsync()
  assert.equal(playCalls.length, 1)
})

test("AC-07: 조회·복원·읽음·재접속은 재생 0회다", async (t) => {
  loginAs(ACCOUNT_A)
  const row = notification({ id: "sys-restored" })

  const { player, playCalls } = createRecordingRuntime()
  t.after(() => player.dispose())

  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row],
    markNotificationReadApi: async () => ({ ...row, readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await useNotificationsStore.getState().loadSnapshot()
  assert.equal(playCalls.length, 0)

  await useNotificationsStore.getState().markRead(row.id)
  assert.equal(playCalls.length, 0)

  useNotificationsStore.getState().beginResync()
  const duringResync = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })
  assert.equal(duringResync.reason, "buffered", "재접속 중 사건은 복원으로 취급한다")
  await useNotificationsStore.getState().loadSnapshot()
  assert.equal(playCalls.length, 0)

  const lateLive = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })
  assert.equal(lateLive.reason, "already-handled")
  await flushAsync()
  assert.equal(playCalls.length, 0)
})

test("AC-07: 다른 계정 앞으로 온 봉투와 계정 전환 뒤의 늦은 봉투는 재생 0회다", async (t) => {
  loginAs(ACCOUNT_A)
  await primeLoadedSnapshot([])
  const { player, playCalls } = createRecordingRuntime()
  t.after(() => player.dispose())

  const row = notification({ id: "sys-other" })
  const wrong = receiveLiveEnvelope(player, ACCOUNT_A, {
    notification: row,
    sfxEvent: systemEnvelope(row, ACCOUNT_B),
  })
  assert.equal(wrong.reason, "account-mismatch")
  assert.equal(playCalls.length, 0)

  loginAs(ACCOUNT_B)
  await primeLoadedSnapshot([])
  const stale = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })
  assert.equal(stale.dispatched, false)
  await flushAsync()
  assert.equal(playCalls.length, 0)
})

test("AC-07: 알림 off와 mute는 재생 0회이고, 설정을 다시 켜도 같은 사건은 재생 0회다", async (t) => {
  loginAs(ACCOUNT_A)
  await primeLoadedSnapshot([])
  const { player, playCalls } = createRecordingRuntime()
  t.after(() => player.dispose())

  useSettingsStore.setState({
    generalChecks: { ...buildDefaultGeneralChecks(), "system-notification": false },
  })

  const offRow = notification({ id: "sys-off" })
  const offResult = receiveLiveEnvelope(player, ACCOUNT_A, {
    notification: offRow,
    sfxEvent: systemEnvelope(offRow),
  })
  assert.equal(offResult.dispatched, true, "처리 이력은 설정과 무관하게 소모된다")
  assert.equal(offResult.result.reason, SFX_SUPPRESSED_REASON.NOTIFICATION_DISABLED)
  assert.equal(playCalls.length, 0)

  useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  player.refreshMix()
  assert.equal(
    receiveLiveEnvelope(player, ACCOUNT_A, { notification: offRow, sfxEvent: systemEnvelope(offRow) }).reason,
    "already-handled",
  )
  assert.equal(playCalls.length, 0)

  useSettingsStore.setState({ sfxMuted: true })
  player.refreshMix()
  const mutedRow = notification({ id: "sys-muted", sourceKey: "system:muted-check:v1" })
  const mutedResult = receiveLiveEnvelope(player, ACCOUNT_A, {
    notification: mutedRow,
    sfxEvent: systemEnvelope(mutedRow),
  })
  assert.equal(mutedResult.result.reason, SFX_SUPPRESSED_REASON.MUTED)
  assert.equal(playCalls.length, 0)
  assert.ok(
    useNotificationsStore.getState().items.some((item) => item.id === "sys-muted"),
    "mute는 목록을 지우지 않는다",
  )
  useSettingsStore.setState({ sfxMuted: false })
})

test("A-07(2026-09-22 개정): 실제 배포 manifest의 system-notification은 자작 합성 승인 자산이라 최초 처리에서 매체 1개를 만들어 재생한다", async (t) => {
  loginAs(ACCOUNT_A)
  await primeLoadedSnapshot([])
  const { player, playCalls, created } = createRecordingRuntime({ manifest: SFX_MANIFEST })
  t.after(() => player.dispose())

  const row = notification({ id: "sys-deploy" })
  const result = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })

  assert.equal(result.dispatched, true)
  assert.notEqual(result.result.status, "suppressed", "승인 자산이 억제됐다: " + result.result.reason)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(created.length, 1, "승인 자산은 Audio를 정확히 하나 만든다")
  assert.equal(playCalls.length, 1)
  assert.equal(player.getSilenceLog().some((entry) => entry.kind === "system-notification" && entry.reason === SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED), false)
})

test("A-07(2026-09-22 개정): 배포 manifest의 system-notification 항목은 자작 합성 승인 자산이다", () => {
  const entry = SFX_MANIFEST["system-notification"]
  assert.ok(entry, "F-17이 연결한 kind가 배포 manifest에 등록돼 있어야 한다")
  assert.equal(entry.reviewStatus, SFX_REVIEW_STATUS.APPROVED)
  assert.equal(entry.src, "/sfx/system-notification.wav")
  assert.equal(entry.scope, SFX_SCOPE.ACCOUNT)
  assert.equal(entry.notificationKey, "system-notification")
  assert.equal(entry.silenceReason, null, "승인 자산에는 무음 사유가 없다")
  assert.equal(checkSfxAssetAllowed(entry).allowed, true)
})

test("A-06: SFX 로드가 영원히 정착하지 않아도 읽음 API와 목록 갱신은 독립적으로 끝난다", async (t) => {
  loginAs(ACCOUNT_A)
  const row = notification({ id: "pending-sfx" })

  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [],
    markNotificationReadApi: async () => ({ ...row, readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await useNotificationsStore.getState().loadSnapshot()

  const { player, playCalls } = createRecordingRuntime({ loadAsset: () => new Promise(() => {}) })
  t.after(() => player.dispose())

  const result = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })
  assert.equal(result.result.status, "accepted")
  assert.equal(playCalls.length, 0)

  const read = await useNotificationsStore.getState().markRead(row.id)
  assert.equal(read.ok, true)
  assert.equal(selectUnreadCount(useNotificationsStore.getState().items, buildDefaultGeneralChecks()), 0)
})

test("A-06: 로드 reject·해시 불일치·play 실패가 나도 목록 반영과 읽음이 그대로 완료된다", async (t) => {
  loginAs(ACCOUNT_A)
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [],
    markNotificationReadApi: async (id) => ({ ...notification({ id }), readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await useNotificationsStore.getState().loadSnapshot()

  const failures = [
    { label: "load reject", loadAsset: async () => { throw new Error("404") } },
    { label: "hash mismatch", loadAsset: async (entry) => ({ sha256: "sha256-wrong", src: entry.src }) },
  ]

  for (const [index, failure] of failures.entries()) {
    const { player } = createRecordingRuntime({ loadAsset: failure.loadAsset })
    const row = notification({ id: `fail-${index}`, sourceKey: `system:fail:${index}` })

    const result = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })
    assert.equal(result.result.status, "accepted", failure.label)

    assert.ok(useNotificationsStore.getState().items.some((item) => item.id === row.id), failure.label)
    const read = await useNotificationsStore.getState().markRead(row.id)
    assert.equal(read.ok, true, failure.label)

    player.dispose()
  }
})

test("A-06: 재생기 자체가 던져도 알림 목록 반영은 계속된다", async () => {
  loginAs(ACCOUNT_A)
  await primeLoadedSnapshot([])

  const throwingPlayer = {
    dispatch() {
      throw new Error("player exploded")
    },
  }

  const row = notification({ id: "throwing" })
  assert.throws(() => receiveLiveEnvelope(throwingPlayer, ACCOUNT_A, {
    notification: row,
    sfxEvent: systemEnvelope(row),
  }))
  assert.ok(
    useNotificationsStore.getState().items.some((item) => item.id === "throwing"),
    "소리 단계의 예외 이전에 목록이 이미 반영돼 있어야 한다",
  )
})

test("AC-07: 친구 요청의 목록 반영이 친구 사건의 최초 소리를 먼저 소모하지 않는다", async () => {
  loginAs(ACCOUNT_A)
  await primeLoadedSnapshot([])

  const sourceKey = "friend-request:42:received"
  const row = notification({ id: "friend-row", type: "friend-request", sourceKey })

  const applied = useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, row)
  assert.equal(applied.applied, true)

  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, sourceKey),
    true,
    "목록 upsert가 친구 사건의 최초 소리를 먹으면 안 된다",
  )
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, sourceKey), false)
})

test("AC-07: 복원으로 본 업적 지급은 재접속 뒤 achievement_granted가 다시 와도 무음이다", async () => {
  loginAs(ACCOUNT_A)
  const sourceKey = "achievement:noble-win-10:granted"
  await primeLoadedSnapshot([notification({ id: "ach-row", type: "achievement", sourceKey })])

  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, sourceKey),
    false,
    "이미 복원된 지급은 새 사건이 아니다",
  )
})

test("AC-07: ready ACK 실패는 재시도 상태로만 남고 조회·읽음을 잠그지 않는다", async () => {
  loginAs(ACCOUNT_A)
  const row = notification({ id: "ready-row" })
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row],
    markNotificationReadApi: async () => ({ ...row, readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await useNotificationsStore.getState().loadSnapshot()

  useNotificationsStore.getState().setReadyState("retry")

  const reloaded = await useNotificationsStore.getState().loadSnapshot()
  assert.equal(reloaded.ok, true)
  const read = await useNotificationsStore.getState().markRead(row.id)
  assert.equal(read.ok, true)
  assert.equal(useNotificationsStore.getState().readyState, "retry", "재시도 상태는 그대로 기록된다")
})
