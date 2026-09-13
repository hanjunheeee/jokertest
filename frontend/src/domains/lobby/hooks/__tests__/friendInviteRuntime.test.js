import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// F-19 AC-06/AC-07 · 게임 초대 런타임 시험.
//
// 실제 useFriendSocketEvents를 React에 **마운트**하고, 실제 gameInvite store와 실제 F-16
// 재생기(createSfxPlayer)를 통해 다음을 확인한다:
//
//   - 커서 경계: 리스너를 먼저 달고 snapshot이 늦게 도착하는 실제 순서에서, 커서 이하 사건은
//     무음이고 커서 이후의 진짜 신규 수신만 한 번 소리 후보가 된다.
//   - 병합: 지연 도착한 오래된 생성 사건이 최신 terminal(거절·만료·차단 취소) 상태를
//     되살리지 못한다.
//   - 계정 경계: 다른 계정의 사건·계정 전환 직후 도착한 늦은 사건은 새 계정 상태를 건드리지
//     않고 소리도 내지 않는다.
//   - 소리와 업무의 분리: 재생이 던지거나 영원히 끝나지 않아도 수락·거절 ACK와 상태 갱신·
//     입장 이동이 그대로 완료된다.
//   - 이동 단일 소유자: 확정 성공 ACK 하나에 이동이 정확히 한 번이다.
//
// **중요(A-07):** 아래 재생 횟수 시험은 시험 전용 fixture manifest를 쓴다. fixture와 가짜
// 매체는 배포용 자산 검토도, 실제 청음도 아니다. 실제 배포 manifest의 "game-invite" 항목은
// 여전히 미검토라 매체가 하나도 만들어지지 않는다는 사실을 아래에서 따로 확인한다.
// ---------------------------------------------------------------------------

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
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ── API 경계 대역 ────────────────────────────────────────────────────────────
//
// store가 모듈을 불러올 때 실제 서버 요청이 나가지 않도록 상대 경로로 대체한다
// (friendFavorites.test.js와 같은 관례). 여기서 바꾸는 것은 **네트워크 경계 하나뿐**이고
// store·훅·재생기는 전부 실제 코드다.
let snapshotResponder = async () => ({ invites: [], cursor: "0" })
let declineResponder = async (inviteId) => ({ inviteId })
let createInviteResponder = async () => ({})
const apiCalls = { snapshot: 0, decline: 0, create: 0 }

mock.module("../../api/friend.api.js", {
  namedExports: {
    fetchMyFriends: async () => [],
    fetchIncomingRequests: async () => [],
    fetchFriendRequestResults: async () => [],
    fetchFavoriteFriendIds: async () => [],
    setFriendFavoriteApi: async (friendId, favorite) => ({ friendId, favorite }),
    fetchBlockedUsers: async () => [],
    blockUserApi: async () => ({}),
    unblockUserApi: async () => ({}),
    searchFriendCandidates: async () => [],
    sendFriendRequest: async () => ({}),
    acceptFriendRequest: async () => ({}),
    declineFriendRequest: async () => ({}),
    fetchGameInviteSnapshot: async () => {
      apiCalls.snapshot += 1
      return snapshotResponder()
    },
    createGameInviteApi: async (receiverId, creationKey) => {
      apiCalls.create += 1
      return createInviteResponder(receiverId, creationKey)
    },
    fetchGameInviteApi: async () => ({}),
    declineGameInviteApi: async (inviteId) => {
      apiCalls.decline += 1
      return declineResponder(inviteId)
    },
  },
})

const { act, createElement } = await import("react")
const { createRoot } = await import("react-dom/client")

const { useFriendSocketEvents, requestGameInviteAccept, shouldEnterRoomFromAccept } = await import(
  "../useFriendSocketEvents.js"
)
const { useGameInviteStore, selectPendingInvites } = await import("../../store/gameInvite.store.js")
const { useFriendStore } = await import("../../store/friend.store.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useMatchingStore } = await import("../../../game/matching/store/matchingStore.js")
const { useInGameStore } = await import("../../../game/ingame/store/ingameStore.js")
const { setSocket } = await import("../../../../shared/socket/socketClient.js")
const { __setSfxPlayerForTests } = await import("../../../../shared/hooks/useSfxRuntime.js")
const { createSfxPlayer } = await import("../../../../shared/audio/sfxPlayer.js")
const {
  SFX_MANIFEST,
  SFX_CLASSIFICATION,
  SFX_REVIEW_STATUS,
  SFX_SCOPE,
  SFX_SUPPRESSED_REASON,
  checkSfxAssetAllowed,
} = await import("../../../../shared/audio/sfxManifest.js")

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111"
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222"

// ---------------------------------------------------------------------------
// 시험 장비
// ---------------------------------------------------------------------------

const FIXTURE_HASH = "sha256-fixture-invite"

/** 시험 전용 승인 fixture. 배포 자산 검토가 아니다. */
const FIXTURE_MANIFEST = {
  "game-invite": {
    scope: SFX_SCOPE.ACCOUNT,
    notificationKey: "friend-invite",
    reviewStatus: SFX_REVIEW_STATUS.APPROVED,
    silenceReason: null,
    source: "fixture://test",
    creator: "test-fixture",
    usageTerms: "test-only",
    sha256: FIXTURE_HASH,
    src: "/fixture/invite.wav",
    durationMs: 400,
    classification: SFX_CLASSIFICATION.SHORT_NON_MUSICAL,
  },
}

function flush(times = 8) {
  return (async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
  })()
}

/** 실제 매체 대신 쓰는 기록용 대역. 만들어진 개수가 곧 "재생 시도 횟수"다. */
function createMediaRecorder(options = {}) {
  const created = []
  const factory = (src) => {
    const listeners = new Map()
    const playPromise = options.playMode === "pending" ? new Promise(() => {}) : Promise.resolve()
    playPromise.catch(() => {})
    const media = {
      src,
      volume: 1,
      muted: false,
      playCalls: 0,
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type).add(handler)
      },
      removeEventListener(type, handler) {
        listeners.get(type)?.delete(handler)
      },
      play() {
        media.playCalls += 1
        if (options.playThrows) throw new Error("play threw")
        return playPromise
      },
      pause() {},
    }
    created.push(media)
    return media
  }
  factory.created = created
  return factory
}

/**
 * 실제 F-16 재생기를 만들어 앱 전역 런타임 자리에 꽂는다.
 * 설정·시계·매체만 시험이 소유하고, 판정 코드는 production 그대로다.
 */
function installPlayer(overrides = {}) {
  const createMedia = overrides.createMedia ?? createMediaRecorder()
  const settings = {
    masterVolume: 100,
    sfxVolume: 80,
    sfxMuted: false,
    notifications: { "friend-invite": true },
    ...(overrides.settings ?? {}),
  }
  const settingsListeners = new Set()
  let currentTime = 0
  const timers = new Map()
  let nextTimerId = 1

  const player = createSfxPlayer({
    manifest: overrides.manifest ?? FIXTURE_MANIFEST,
    getSettings: () => settings,
    subscribeSettings: (listener) => {
      settingsListeners.add(listener)
      return () => settingsListeners.delete(listener)
    },
    getScope: () => {
      const auth = useAuthStore.getState()
      return {
        accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
        gameId: useInGameStore.getState().gameId ?? null,
        roomId: useMatchingStore.getState().roomId ?? null,
      }
    },
    loadAsset: overrides.loadAsset ?? (async () => ({ sha256: FIXTURE_HASH, src: "/fixture/invite.wav" })),
    createMedia,
    now: () => currentTime,
    setTimer: (fn, ms) => {
      const id = nextTimerId++
      timers.set(id, { at: currentTime + ms, fn })
      return id
    },
    clearTimer: (id) => timers.delete(id),
  })

  __setSfxPlayerForTests(player)
  return {
    player,
    media: createMedia.created,
    setSettings(next) {
      Object.assign(settings, next)
      for (const listener of [...settingsListeners]) listener()
    },
  }
}

/** 실제 socket.io 클라이언트 대신 쓰는 최소 대역 — 등록/해제와 ack를 그대로 재현한다. */
function createFakeSocket({ connected = true } = {}) {
  const handlers = new Map()
  const emits = []
  let ackResponder = null
  return {
    connected,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(handler)
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },
    emit(event, payload, ack) {
      emits.push({ event, payload, ack })
      if (typeof ackResponder === "function") ackResponder(event, payload, ack)
    },
    __emits: emits,
    __setAckResponder(fn) { ackResponder = fn },
    __listenerCount(event) { return handlers.get(event)?.size ?? 0 },
    __fire(event, payload) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(payload)
    },
  }
}

function invite(overrides = {}) {
  return {
    inviteId: "invite-1",
    senderId: "sender-1",
    senderName: "광대",
    receiverId: ACCOUNT_A,
    status: "PENDING",
    revision: 1,
    creationSeq: "10",
    createdAt: "2026-09-13T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z",
    decidedAt: null,
    endReason: null,
    entryOutcome: null,
    ...overrides,
  }
}

/** 서버가 신규 수신에 싣는 봉투. eventId는 초대 id 기반의 안정 문자열이다. */
function invitePayload(row, accountId = row.receiverId) {
  return {
    invite: row,
    sfxEvent: {
      kind: "game-invite",
      eventId: `game-invite:${row.inviteId}:received`,
      accountId,
      origin: "live",
    },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  promise.catch(() => {})
  return { promise, resolve, reject }
}

/** App이 하는 배선 그대로: 훅 하나를 마운트하고 라우터 navigate를 주입한다. */
function Harness({ socket, navigate }) {
  useFriendSocketEvents(socket, { navigate })
  return null
}

async function mountHook(socket, navigate) {
  const container = dom.window.document.createElement("div")
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(Harness, { socket, navigate }))
  })
  return {
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

function signIn(uuid) {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid } })
}

function resetAll() {
  snapshotResponder = async () => ({ invites: [], cursor: "0" })
  declineResponder = async (inviteId) => ({ inviteId })
  createInviteResponder = async () => ({})
  apiCalls.snapshot = 0
  apiCalls.decline = 0
  apiCalls.create = 0
  __setSfxPlayerForTests(null)
  setSocket(null)
  useGameInviteStore.getState().__resetForTests()
  useFriendStore.getState().__resetForTests()
  useAuthStore.setState({ isLoggedIn: false, user: null })
  useMatchingStore.setState({ roomId: null })
}

test.beforeEach(resetAll)
test.afterEach(resetAll)

// ---------------------------------------------------------------------------
// A-07 · 배포 manifest는 여전히 무음이다
// ---------------------------------------------------------------------------

test("A-07: 배포 manifest의 game-invite는 미검토 무음이고 매체를 만들지 않는다", async () => {
  const entry = SFX_MANIFEST["game-invite"]
  assert.ok(entry, "배포 manifest에 game-invite 항목이 있어야 한다")
  assert.equal(entry.scope, SFX_SCOPE.ACCOUNT)
  assert.equal(entry.notificationKey, "friend-invite")
  assert.equal(entry.reviewStatus, SFX_REVIEW_STATUS.NEEDS_REVIEW, "미검토 자산을 근거 없이 승인하지 않는다")
  assert.equal(entry.src, null, "존재하지 않는 경로를 지어내지 않는다")
  assert.equal(entry.sha256, null, "지어낸 해시가 없어야 한다")
  assert.equal(typeof entry.silenceReason, "string")
  assert.equal(checkSfxAssetAllowed(entry).allowed, false)

  // 실제 배포 manifest로 재생기를 돌리면 매체가 하나도 만들어지지 않는다.
  signIn(ACCOUNT_A)
  const h = installPlayer({ manifest: SFX_MANIFEST })
  const result = h.player.dispatch({
    kind: "game-invite", eventId: "game-invite:x:received", accountId: ACCOUNT_A, origin: "live",
  })
  await flush()

  assert.equal(result.status, "suppressed")
  assert.equal(result.reason, SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED)
  assert.equal(h.media.length, 0, "미검토 자산에 매체가 만들어졌다 — 모의 재생을 청음으로 주장하지 않는다")
})

// ---------------------------------------------------------------------------
// AC-07 · 커서 경계와 복원 보류
// ---------------------------------------------------------------------------

test("AC-07: 복원 중에 온 사건은 보류됐다가 커서 이후의 것만 한 번 울린다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  // snapshot을 지연시킨다 — 리스너가 먼저 달리고 복원이 나중에 끝나는 실제 순서.
  const gate = deferred()
  snapshotResponder = () => gate.promise

  const mounted = await mountHook(socket)
  assert.equal(socket.__listenerCount("game_invite_received"), 1)

  const past = invite({ inviteId: "past", creationSeq: "50" })
  const fresh = invite({ inviteId: "fresh", creationSeq: "120" })

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(past))
    socket.__fire("game_invite_received", invitePayload(fresh))
  })

  // 복원이 해소되기 전에는 판정을 **보류**한다 — 소리도, 표식 소모도 없다.
  assert.equal(h.media.length, 0, "복원 보류 중에 소리가 났다")

  await act(async () => {
    gate.resolve({ invites: [past], cursor: "100" })
    await flush()
  })

  const state = useGameInviteStore.getState()
  assert.equal(state.snapshotLoaded, true)
  assert.equal(state.cursor, "100")
  assert.deepEqual(
    state.invites.map((row) => row.inviteId).sort(),
    ["fresh", "past"],
    "버퍼에 있던 사건도 목록에는 반영된다",
  )

  // 커서 이후의 진짜 신규 사건만 소리 후보다. 커서 이하(past)는 복원이 이미 알고 있었다.
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(past))
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })

  assert.equal(h.media.length, 1, "커서 이후 신규 수신 한 건만 울려야 한다")
  await mounted.unmount()
})

test("AC-07: snapshot 조회가 실패하면 소리 판정을 보류하고 재조회 성공이 과거를 무음 복구한다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  snapshotResponder = async () => { throw new Error("network down") }
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  assert.equal(useGameInviteStore.getState().status, "error")
  assert.equal(useGameInviteStore.getState().restorePending, true, "실패한 조회는 복원 해소가 아니다")

  const row = invite({ inviteId: "unknown-age", creationSeq: "70" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(row))
    await flush()
  })
  assert.equal(h.media.length, 0, "목록의 부재를 '새 사건'의 증거로 쓰면 안 된다")

  // 재조회가 성공하고 그 사건이 실제로는 과거였다면 무음으로 확정된다.
  snapshotResponder = async () => ({ invites: [row], cursor: "70" })
  await act(async () => {
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(row))
    await flush()
  })
  assert.equal(h.media.length, 0, "재조회로 과거임이 밝혀진 사건은 계속 무음이다")
  await mounted.unmount()
})

// ---------------------------------------------------------------------------
// AC-07 · 중복·순서·상태 되살림
// ---------------------------------------------------------------------------

test("AC-07: 같은 초대는 몇 번을 다시 받아도 한 번만 울린다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const row = invite({ inviteId: "dup", creationSeq: "5" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(row))
    socket.__fire("game_invite_received", invitePayload(row))
    // 상태 변경 전달(무음 경로)도 새 소리를 만들지 않는다.
    socket.__fire("game_invite_updated", { invite: { ...row, revision: 2, status: "PENDING" } })
    await flush()
  })

  assert.equal(h.media.length, 1)

  // 재접속 복원도 다시 울리지 않는다.
  snapshotResponder = async () => ({ invites: [row], cursor: "5" })
  await act(async () => {
    socket.__fire("connect")
    await flush()
  })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(row))
    await flush()
  })
  assert.equal(h.media.length, 1, "재접속 복원으로 다시 배달된 초대가 울렸다")
  await mounted.unmount()
})

test("AC-07: 지연 도착한 오래된 생성 사건이 최신 terminal 상태를 되살리거나 울리지 않는다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const ended = invite({ inviteId: "late", creationSeq: "9", revision: 3, status: "DECLINED", endReason: "DECLINED" })
  const stale = invite({ inviteId: "late", creationSeq: "9", revision: 1, status: "PENDING" })

  await act(async () => {
    // terminal이 먼저 도착하고, 그 다음에 오래된 생성 사건이 도착한다.
    socket.__fire("game_invite_updated", { invite: ended })
    socket.__fire("game_invite_received", invitePayload(stale))
    await flush()
  })

  const merged = useGameInviteStore.getState().invites.find((row) => row.inviteId === "late")
  assert.equal(merged.revision, 3, "오래된 사건이 최신 revision을 덮었다")
  assert.equal(merged.status, "DECLINED")
  assert.deepEqual(selectPendingInvites(useGameInviteStore.getState().invites), [])
  assert.equal(h.media.length, 0, "종료된 초대의 지연 생성 사건이 울렸다")
  await mounted.unmount()
})

test("AC-07: 만료된 초대는 신규 수신이어도 울리지 않는다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const expired = invite({ inviteId: "old", creationSeq: "8", expiresAt: "2020-01-01T00:00:00.000Z" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(expired))
    await flush()
  })

  assert.equal(h.media.length, 0)
  await mounted.unmount()
})

// ---------------------------------------------------------------------------
// A-02 · 계정 경계
// ---------------------------------------------------------------------------

test("A-02: 다른 계정의 사건과 잘못된 수신자는 울리지도, 목록에 들어가지도 않는다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const forOther = invite({ inviteId: "other", creationSeq: "11", receiverId: ACCOUNT_B })
  await act(async () => {
    // 서버 봉투의 계정이 다른 경우.
    socket.__fire("game_invite_received", invitePayload(forOther, ACCOUNT_B))
    // 봉투는 내 계정인데 초대의 수신자가 다른 경우(이중 방어).
    socket.__fire("game_invite_received", invitePayload(forOther, ACCOUNT_A))
    await flush()
  })

  assert.equal(h.media.length, 0)
  assert.deepEqual(useGameInviteStore.getState().invites, [])
  await mounted.unmount()
})

test("A-02: 계정 전환이 이전 계정의 초대·커서·표식을 즉시 버리고 늦은 사건이 새 계정을 건드리지 않는다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const rowA = invite({ inviteId: "a-1", creationSeq: "30", receiverId: ACCOUNT_A })
  snapshotResponder = async () => ({ invites: [rowA], cursor: "30" })

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })
  assert.equal(useGameInviteStore.getState().invites.length, 1)

  // A → B 전환. 소켓 유무와 무관하게 auth 구독이 계정 경계를 지킨다.
  snapshotResponder = async () => ({ invites: [], cursor: "0" })
  await act(async () => {
    signIn(ACCOUNT_B)
    await flush()
  })

  const state = useGameInviteStore.getState()
  assert.equal(state.accountId, ACCOUNT_B)
  assert.deepEqual(state.invites, [], "이전 계정의 초대가 새 계정 화면에 남았다")
  assert.equal(state.cursor, "0")

  // 전환 뒤 도착한 A의 사건은 무시된다.
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(rowA, ACCOUNT_A))
    await flush()
  })
  assert.deepEqual(useGameInviteStore.getState().invites, [])
  assert.equal(h.media.length, 0)

  // 로그아웃도 같은 경계를 지난다.
  await act(async () => {
    useAuthStore.setState({ isLoggedIn: false, user: null })
    await flush()
  })
  assert.equal(useGameInviteStore.getState().accountId, null)
  await mounted.unmount()
})

// ---------------------------------------------------------------------------
// A-03 · 설정 off·mute에서도 표식을 소모한다
// ---------------------------------------------------------------------------

test("A-03: 알림 off·mute여도 표식을 소모해 설정을 켠 뒤 과거 사건이 울리지 않는다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer({ settings: { notifications: { "friend-invite": false } } })
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const row = invite({ inviteId: "muted", creationSeq: "12" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(row))
    await flush()
  })

  assert.equal(h.media.length, 0, "알림이 꺼져 있으면 소리가 나지 않는다")
  // 원본 초대와 수동 처리 목록은 설정과 무관하게 그대로 남는다.
  assert.equal(useGameInviteStore.getState().invites.length, 1)
  assert.equal(
    useGameInviteStore.getState().soundConsumed.has("muted"), true,
    "off여도 표식을 소모해야 설정을 켠 뒤 과거 사건이 울리지 않는다",
  )

  h.setSettings({ notifications: { "friend-invite": true } })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(row))
    await flush()
  })
  assert.equal(h.media.length, 0, "설정을 켜자 과거 사건이 울렸다")
  await mounted.unmount()
})

// ---------------------------------------------------------------------------
// AC-06 · 수락 ACK와 이동 단일 소유자
// ---------------------------------------------------------------------------

test("AC-06: 확정 성공 ACK 하나에 대기방 이동이 정확히 한 번 일어난다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [invite({ inviteId: "go", creationSeq: "1" })], cursor: "1" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })

  socket.__setAckResponder((event, payload, ack) => {
    assert.equal(event, "accept_game_invite")
    assert.deepEqual(payload, { inviteId: "go" })
    ack({ ok: true, room: { roomId: "room-9", roomCode: "ABCD", players: [] } })
  })

  let result
  await act(async () => {
    result = await requestGameInviteAccept("go")
    await flush()
  })

  assert.equal(shouldEnterRoomFromAccept(result), true)
  assert.deepEqual(navigated, ["/game-matching"], "이동 소유자가 둘이면 두 번 이동한다")
  assert.equal(useMatchingStore.getState().roomId, "room-9")
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("go"), false)
  await mounted.unmount()
})

test("AC-06: 실패·응답 유실 ACK는 이동하지 않고 사유를 남긴 뒤 서버 상태를 다시 읽는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [invite({ inviteId: "no", creationSeq: "1" })], cursor: "1" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })
  const snapshotsBefore = apiCalls.snapshot

  // 서버가 방 상태 재검증에서 거부했다(가득 참·삭제·시작 등).
  socket.__setAckResponder((event, payload, ack) => ack({ ok: false, code: "ROOM_FULL", message: "방이 가득 찼습니다." }))

  await act(async () => {
    await requestGameInviteAccept("no")
    await flush()
  })

  assert.deepEqual(navigated, [], "실패 ACK로 이동하면 안 된다")
  assert.equal(useGameInviteStore.getState().inviteErrors.no, "방이 가득 찼습니다.")
  assert.ok(apiCalls.snapshot > snapshotsBefore, "실패 뒤 서버 상태를 다시 읽어야 한다")

  // 역사적 성공만 있고 현재 소속이 없는 응답도 이동 근거가 아니다(A-10).
  assert.equal(shouldEnterRoomFromAccept({ ok: true, room: null }), false)
  assert.equal(shouldEnterRoomFromAccept({ ok: true, entryOutcome: "PUBLISHED" }), false)
  assert.equal(shouldEnterRoomFromAccept({ ok: false, room: { roomId: "x" } }), false)
  await mounted.unmount()
})

test("AC-07: 재생이 던지거나 영원히 끝나지 않아도 수락·거절과 상태 갱신이 완료된다", async () => {
  signIn(ACCOUNT_A)
  // 매체가 play()에서 던지고, 그 다음 재생은 영원히 끝나지 않는다.
  installPlayer({ createMedia: createMediaRecorder({ playThrows: true }) })
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })

  const row = invite({ inviteId: "resilient", creationSeq: "3" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(row))
    await flush()
  })
  // 소리가 실패해도 목록 반영은 그대로다.
  assert.equal(useGameInviteStore.getState().invites.length, 1)

  socket.__setAckResponder((event, payload, ack) => ack({ ok: true, room: { roomId: "room-ok", players: [] } }))
  await act(async () => {
    await requestGameInviteAccept("resilient")
    await flush()
  })
  assert.deepEqual(navigated, ["/game-matching"], "재생 실패가 입장을 막았다")

  // 거절도 마찬가지다 — 영원히 끝나지 않는 재생 중에도 ACK가 상태를 확정한다.
  installPlayer({ createMedia: createMediaRecorder({ playMode: "pending" }) })
  declineResponder = async (inviteId) => ({ ...row, inviteId, status: "DECLINED", revision: 2 })
  let declineResult
  await act(async () => {
    declineResult = await useGameInviteStore.getState().declineInvite("resilient")
    await flush()
  })
  assert.equal(declineResult.ok, true)
  assert.equal(
    useGameInviteStore.getState().invites.find((item) => item.inviteId === "resilient").status,
    "DECLINED",
  )
  await mounted.unmount()
})

// ---------------------------------------------------------------------------
// 리스너 수명과 "초대가 아닌 것"의 경계
// ---------------------------------------------------------------------------

test("AC-01/A-02: 언마운트는 자기 리스너만 떼고 방코드 입장은 초대 수신이 아니다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  // 다른 구독자(useRoomInvitePage 등)가 같은 이벤트에 이미 붙어 있는 상황.
  let otherCalls = 0
  const otherHandler = () => { otherCalls += 1 }
  socket.on("connect", otherHandler)

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  assert.equal(socket.__listenerCount("connect"), 2)
  // 방 코드 입장 경로(room_joined)는 이 훅이 아예 듣지 않는다 — 초대 수신으로 계산되지 않는다.
  assert.equal(socket.__listenerCount("room_joined"), 0)
  await act(async () => {
    socket.__fire("room_joined", { room: { roomId: "r" } })
    await flush()
  })
  assert.equal(h.media.length, 0, "방 코드 입장이 초대 소리를 냈다")

  await mounted.unmount()

  // 등록할 때와 같은 함수 참조로만 off한다 — 다른 구독자의 리스너는 남아 있어야 한다.
  assert.equal(socket.__listenerCount("connect"), 1)
  assert.equal(socket.__listenerCount("game_invite_received"), 0)
  await act(async () => {
    socket.__fire("connect")
    await flush()
  })
  assert.equal(otherCalls, 1, "다른 구독자의 리스너까지 지워졌다")
})
