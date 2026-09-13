import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// F-17 알림 **상태 저장소와 F-16 재생기** 계약 시험.
//
// 실제 production store(notifications.store.js)와 실제 재생기(createSfxPlayer)를 그대로
// 돌린다 — 소스를 정규식으로 훑지 않는다. 네트워크(api 모듈)와 매체·타이머만 시험이
// 소유해서 순서·실패를 결정적으로 재현한다.
//
// 범위를 정확히 적는다(R-IMPL #5): **이 파일은 useNotificationSocketEvents를 마운트하지
// 않는다.** 아래 receiveLiveEnvelope는 훅이 아니라, 훅과 같은 순서로 store·재생기를 부르는
// 시험용 호출자다 — 그래서 이 파일로는 접속 수명(connect/disconnect·늦은 ACK·소켓 교체·
// cleanup)을 증명할 수 없다. 그것은 실제 훅을 React 루트에 마운트하는
// ./notificationSocketEvents.test.js가 담당한다.
//
// 중요(A-07): "재생됐다"를 확인하는 시험들은 **시험 전용 fixture manifest**와 가짜 매체를
// 쓴다. 이것은 배포 자산 검토도, 실제 청음도 아니다. 실제 배포 manifest(SFX_MANIFEST)의
// system-notification은 여전히 미검토라 매체를 만들지 않는다는 것 자체를 아래에서 따로
// 검사한다(sfxPlayer.test.js와 같은 구분).
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

const {
  useNotificationsStore,
  mergeNotifications,
  selectVisibleNotifications,
  selectUnreadCount,
  isNotificationBackedSourceKey,
  isConfirmedReadRow,
  __setNotificationsApiForTests,
} = await import("../../store/notifications.store.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useSettingsStore, buildDefaultGeneralChecks, buildDefaultSoundVolumes, SFX_MUTED_DEFAULT } =
  await import("../../../settings/store/settingsStore.js")
const { createSfxPlayer } = await import("../../../../shared/audio/sfxPlayer.js")
const {
  SFX_MANIFEST,
  SFX_REVIEW_STATUS,
  SFX_CLASSIFICATION,
  SFX_SUPPRESSED_REASON,
  SFX_SCOPE,
  checkSfxAssetAllowed,
} = await import("../../../../shared/audio/sfxManifest.js")

// ---------------------------------------------------------------------------
// 시험 장비
// ---------------------------------------------------------------------------

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

/** 서버가 시스템 알림에만 싣는 봉투 형태 그대로. */
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

/** 재생기 내부의 비동기 로드(→ 매체 생성 → play)가 끝날 때까지 흘려보낸다. */
function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** 해소를 시험이 직접 쥐는 promise. */
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
  // 설정은 **매번 전부** 기본값으로 되돌린다 — 한 시험이 중간에 실패해 mute나 볼륨을
  // 되돌리지 못하면 뒤따르는 시험이 "재생 0회"를 잘못된 이유로 통과하게 된다.
  useSettingsStore.setState({
    generalChecks: buildDefaultGeneralChecks(),
    volumes: buildDefaultSoundVolumes(),
    sfxMuted: SFX_MUTED_DEFAULT,
  })
})

test.afterEach(() => {
  __setNotificationsApiForTests(null)
})

// ---------------------------------------------------------------------------
// 병합(A-04) — 오래된 GET이 최신 상태를 되돌리지 못한다
// ---------------------------------------------------------------------------

test("A-04: union 병합은 기존 행을 지우지 않고 read_at을 null로 되돌리지 않는다", () => {
  const live = notification({ id: "id-live", sourceKey: "friend-request:9:received" })
  const readLocally = notification({ id: "id-read", readAt: "2026-09-13T01:00:00.000Z" })

  // 오래된 GET 결과: live 행을 모르고, 읽은 행도 아직 미확인으로 알고 있다.
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

// ---------------------------------------------------------------------------
// 복원(AC-06 / A-04)
// ---------------------------------------------------------------------------

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

  // 아직 loadSnapshot을 부르지 않았다(리스너만 먼저 달린 상태).
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

// ---------------------------------------------------------------------------
// 복원 경계(R-IMPL #5) — 복원이 진행 중인 동안 알림 사건은 소리 후보가 아니다
// ---------------------------------------------------------------------------

test("R-IMPL#5: 복원이 진행 중이면 아직 못 본 업적·친구 수신 사건도 소리 후보가 아니다", async () => {
  loginAs(ACCOUNT_A)
  const slow = deferred()
  __setNotificationsApiForTests({ fetchNotificationsApi: () => slow.promise })

  const loading = useNotificationsStore.getState().loadSnapshot()

  // 예전 구현은 snapshotLoaded=false면 아무 키나 최초 처리로 인정했다 — 그래서 복원이
  // 끝나기 전에 도착한 기존 업적·친구 수신 사건이 소리를 냈고, 곧 도착한 snapshot이 같은
  // 사건을 담고 있어도 이미 울린 뒤였다.
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

  // 복원이 끝난 뒤 **새** 사건은 정상적으로 최초 처리다(경계가 사건을 영구히 삼키지 않는다).
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

  // 서버는 수락·거절로 알림 행을 만들지 않는다 — 복원이 그 사건을 알 길이 없으므로 여기서
  // 삼키면 그대로 잃는다(F-16 회귀).
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:accepted"), true)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:declined"), true)
  // 단, 같은 사건은 두 번째부터 막힌다.
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
  // 실패한 조회는 복원을 **해소하지 못한다**. 예전 구현은 여기서 경계를 내려서, 서버 목록을
  // 한 번도 받지 못한 채 과거 업적·친구 수신 사건이 다시 울렸다.
  assert.equal(useNotificationsStore.getState().restorePending, true)

  // 못 받은 목록의 부재를 "새 사건"의 증거로 쓰지 않는다.
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
  // 같은 사건이 늦게 반복 배달돼도 계속 거절한다(표식을 소모하지 않았으므로 상태도 그대로).
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "achievement:noble-win-10:granted"),
    false,
  )
  assert.equal(useNotificationsStore.getState().soundSeen.size, 0)

  // 알림 행이 없는 기존 F-16 제어 사건은 조회 실패와 무관하게 최초 소리를 잃지 않는다 —
  // 복원이 그 사건을 알 길이 없으므로 여기서 삼키면 그대로 잃는다.
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:accepted"), true)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:declined"), true)
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, "friend-request:5:accepted"), false)

  // 재시도가 성공하면 경계가 해소된다. snapshot이 담고 있던 과거 키는 계속 무음이고,
  // 진짜 새 사건만 한 번 울린다.
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

// ---------------------------------------------------------------------------
// 읽음(AC-02)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 읽음 확정(AC-02 / R-IMPL #2) — 확정 증거가 없는 응답을 성공으로 돌려주지 않는다
// ---------------------------------------------------------------------------

/** 확정되지 않은 PATCH 응답들. 어느 것도 "읽음 성공"이 아니다. */
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
      // 두 번째(느린) 조회만 시험이 직접 해소한다.
      if (fetchCount === 2) return late.promise
      return [persisted]
    },
    markNotificationReadApi: async () => ({ ...persisted, readAt: "2026-09-13T03:00:00.000Z" }),
  })

  // 첫 복원으로 snapshotLoaded를 세운다.
  await useNotificationsStore.getState().loadSnapshot()

  // 이제 느린 GET을 시작한다(아직 해소하지 않는다).
  const slow = useNotificationsStore.getState().loadSnapshot()

  // 그 사이 live가 오고, 읽음이 성공한다.
  const liveRow = notification({ id: "live", sourceKey: "friend-request:3:received", type: "friend-request" })
  useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, liveRow)
  await useNotificationsStore.getState().markRead("persisted")

  // 이제서야 오래된 GET이 "live 행을 모르고 persisted도 미확인"인 결과로 끝난다.
  late.resolve([notification({ id: "persisted", readAt: null })])
  await slow

  const state = useNotificationsStore.getState()
  assert.ok(state.items.some((item) => item.id === "live"), "오래된 GET이 live 행을 없애면 안 된다")
  assert.ok(
    state.items.find((item) => item.id === "persisted").readAt,
    "오래된 GET이 읽음을 미확인으로 되돌리면 안 된다",
  )
})

// ---------------------------------------------------------------------------
// 계정 경계(A-05)
// ---------------------------------------------------------------------------

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

  // 로그아웃 없이 곧바로 B로 바뀐다(isLoggedIn은 계속 true).
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

// ---------------------------------------------------------------------------
// 표시 설정(AC-04 / A-03)
// ---------------------------------------------------------------------------

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

  // 다시 켜면 숨겼던 행이 read_at과 함께 그대로 돌아온다.
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
  // 설정 off여도 최초 처리에서 표식을 소모한다(재생기의 억제와 별개다).
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, row.sourceKey), true)

  useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, row.sourceKey),
    false,
    "설정을 다시 켰다고 과거 사건이 새 사건이 되면 안 된다",
  )
})

// ---------------------------------------------------------------------------
// F-16 공통 재생기 연결(AC-07)
// ---------------------------------------------------------------------------

const GOOD_HASH = "sha256-f17-fixture-ok"

/** 시험 전용 승인 fixture — 배포 자산 검토가 아니다. */
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

/** 재생 시도를 기록하는 가짜 매체. 실제 소리를 내지 않는다. */
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

/**
 * store·재생기를 훅과 **같은 순서**(목록 반영 → 계정/origin 대조 → 원본 키 소모 →
 * dispatch)로 부르는 시험용 호출자다. **실제 훅이 아니다** — 접속 수명과 실제 dispatch
 * 배선은 notificationSocketEvents.test.js가 실제 훅을 마운트해서 확인한다.
 */
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

  // 같은 봉투를 다시 전달해도(재전달·리렌더) 추가 재생이 없다.
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

  // 복원(GET)으로 사건을 처음 본다 — 소리는 나지 않는다.
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row],
    markNotificationReadApi: async () => ({ ...row, readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await useNotificationsStore.getState().loadSnapshot()
  assert.equal(playCalls.length, 0)

  // 읽음도 소리를 만들지 않는다.
  await useNotificationsStore.getState().markRead(row.id)
  assert.equal(playCalls.length, 0)

  // 재접속: 복원을 다시 하고 그 사이 같은 사건이 다시 전달돼도 무음이다.
  useNotificationsStore.getState().beginResync()
  const duringResync = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })
  assert.equal(duringResync.reason, "buffered", "재접속 중 사건은 복원으로 취급한다")
  await useNotificationsStore.getState().loadSnapshot()
  assert.equal(playCalls.length, 0)

  // 복원이 끝난 뒤 같은 사건이 늦게 도착해도 무음이다.
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
  // 서버가 B 계정이라고 표시한 봉투 — A 화면에서 처리되지 않는다.
  const wrong = receiveLiveEnvelope(player, ACCOUNT_A, {
    notification: row,
    sfxEvent: systemEnvelope(row, ACCOUNT_B),
  })
  assert.equal(wrong.reason, "account-mismatch")
  assert.equal(playCalls.length, 0)

  // 계정이 B로 바뀐 뒤 A 앞으로 온 사건이 늦게 도착해도 마찬가지다.
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

  // 다시 켜도 같은 사건은 새 사건이 아니다.
  useSettingsStore.setState({ generalChecks: buildDefaultGeneralChecks() })
  player.refreshMix()
  assert.equal(
    receiveLiveEnvelope(player, ACCOUNT_A, { notification: offRow, sfxEvent: systemEnvelope(offRow) }).reason,
    "already-handled",
  )
  assert.equal(playCalls.length, 0)

  // mute는 목록·읽음 수에는 영향을 주지 않는다(대조).
  useSettingsStore.setState({ sfxMuted: true })
  player.refreshMix()
  // **다른 원본 사건**이어야 한다 — 같은 source_key를 쓰면 위에서 이미 소모한 표식에 걸려
  // mute가 아니라 중복으로 억제되고, 이 대조 시험이 의미를 잃는다.
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

test("A-07: 실제 배포 manifest에서는 최초 처리도 매체 생성 0·재생 0이고 asset-unreviewed 사유가 남는다", async (t) => {
  loginAs(ACCOUNT_A)
  await primeLoadedSnapshot([])
  const { player, playCalls, created } = createRecordingRuntime({ manifest: SFX_MANIFEST })
  t.after(() => player.dispose())

  const row = notification({ id: "sys-deploy" })
  const result = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })

  assert.equal(result.dispatched, true)
  assert.equal(result.result.status, "suppressed")
  assert.equal(result.result.reason, SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED)
  assert.equal(created.length, 0, "미검토 자산으로 Audio를 만들면 안 된다")
  assert.equal(playCalls.length, 0)

  const record = player.getSilenceLog().find((entry) => entry.kind === "system-notification")
  assert.equal(record.reason, SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED)
  assert.ok(record.note, "무음 사유(silenceReason)가 함께 기록돼야 한다")
})

test("A-07: 배포 manifest의 system-notification 항목은 여전히 미검토다(시험용 승인으로 바꾸지 않았다)", () => {
  const entry = SFX_MANIFEST["system-notification"]
  assert.ok(entry, "F-17이 연결한 kind가 배포 manifest에 등록돼 있어야 한다")
  assert.equal(entry.reviewStatus, SFX_REVIEW_STATUS.NEEDS_REVIEW)
  assert.equal(entry.src, null)
  assert.equal(entry.scope, SFX_SCOPE.ACCOUNT)
  assert.equal(entry.notificationKey, "system-notification")
  assert.ok(entry.silenceReason, "무음 사유를 지우지 않았다")
  assert.equal(checkSfxAssetAllowed(entry).allowed, false)
})

// ---------------------------------------------------------------------------
// SFX 실패·영구 대기가 업무 경로를 막지 않는다(A-06)
// ---------------------------------------------------------------------------

test("A-06: SFX 로드가 영원히 정착하지 않아도 읽음 API와 목록 갱신은 독립적으로 끝난다", async (t) => {
  loginAs(ACCOUNT_A)
  const row = notification({ id: "pending-sfx" })

  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [],
    markNotificationReadApi: async () => ({ ...row, readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await useNotificationsStore.getState().loadSnapshot()

  // 영원히 정착하지 않는 로더.
  const { player, playCalls } = createRecordingRuntime({ loadAsset: () => new Promise(() => {}) })
  t.after(() => player.dispose())

  const result = receiveLiveEnvelope(player, ACCOUNT_A, { notification: row, sfxEvent: systemEnvelope(row) })
  assert.equal(result.result.status, "accepted")
  assert.equal(playCalls.length, 0)

  // completion을 기다리지 않고 읽음이 정상적으로 완료된다.
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

    // 소리 결과와 무관하게 목록·읽음은 끝난다.
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
  // 실제 훅은 dispatchSfxEvent(절대 던지지 않는 래퍼)를 쓰지만, 여기서는 목록 반영이
  // dispatch **이전에** 끝난다는 순서 자체를 확인한다.
  assert.throws(() => receiveLiveEnvelope(throwingPlayer, ACCOUNT_A, {
    notification: row,
    sfxEvent: systemEnvelope(row),
  }))
  assert.ok(
    useNotificationsStore.getState().items.some((item) => item.id === "throwing"),
    "소리 단계의 예외 이전에 목록이 이미 반영돼 있어야 한다",
  )
})

// ---------------------------------------------------------------------------
// 친구·업적 소유권(AC-07) — 한 사건에 소리가 두 번 나지 않는다
// ---------------------------------------------------------------------------

test("AC-07: 친구 요청의 목록 반영이 친구 사건의 최초 소리를 먼저 소모하지 않는다", async () => {
  loginAs(ACCOUNT_A)
  await primeLoadedSnapshot([])

  const sourceKey = "friend-request:42:received"
  const row = notification({ id: "friend-row", type: "friend-request", sourceKey })

  // 서버는 친구 알림에 sfxEvent를 싣지 않는다 — 목록만 바뀐다.
  const applied = useNotificationsStore.getState().receiveLiveNotification(ACCOUNT_A, row)
  assert.equal(applied.applied, true)

  // 뒤이어 도착한 friend_request_received(소리 소유자)는 여전히 최초 처리여야 한다.
  assert.equal(
    useNotificationsStore.getState().consumeSoundEvent(ACCOUNT_A, sourceKey),
    true,
    "목록 upsert가 친구 사건의 최초 소리를 먹으면 안 된다",
  )
  // 그리고 두 번째부터는 막힌다.
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

// ---------------------------------------------------------------------------
// 준비 신호(AC-07)
// ---------------------------------------------------------------------------

test("AC-07: ready ACK 실패는 재시도 상태로만 남고 조회·읽음을 잠그지 않는다", async () => {
  loginAs(ACCOUNT_A)
  const row = notification({ id: "ready-row" })
  __setNotificationsApiForTests({
    fetchNotificationsApi: async () => [row],
    markNotificationReadApi: async () => ({ ...row, readAt: "2026-09-13T03:00:00.000Z" }),
  })
  await useNotificationsStore.getState().loadSnapshot()

  useNotificationsStore.getState().setReadyState("retry")

  // 준비 신호가 실패한 상태에서도 조회·읽음은 정상이다.
  const reloaded = await useNotificationsStore.getState().loadSnapshot()
  assert.equal(reloaded.ok, true)
  const read = await useNotificationsStore.getState().markRead(row.id)
  assert.equal(read.ok, true)
  assert.equal(useNotificationsStore.getState().readyState, "retry", "재시도 상태는 그대로 기록된다")
})
