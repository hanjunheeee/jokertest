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
const {
  INVITE_SFX_QA_FLAG,
  __setInviteSfxDiagnosticsEnvForTests,
  getInviteSfxObservations,
  resetInviteSfxDiagnostics,
  summarizeInviteSfxObservations,
} = await import("../../diagnostics/inviteSfxDiagnostics.js")

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

/**
 * 수락 경로의 서버 응답을 흉내 낸다.
 *
 * 수락 ACK 하나로는 이동하지 않는다 — 클라이언트가 get_current_room으로 **현재 소속**을
 * 다시 확인하고, ACK가 유실되면 get_game_invite_result로 같은 시도의 durable 결과를 되묻는다.
 * 그래서 세 응답을 함께 정해 줘야 실제 경로가 끝까지 돈다.
 */
function respondToAccept(socket, { accept, currentRoom = null, attemptResult = null }) {
  socket.__setAckResponder((event, payload, ack) => {
    if (event === "accept_game_invite") { accept(payload, ack); return }
    if (event === "get_current_room") { ack({ ok: true, room: currentRoom }); return }
    if (event === "get_game_invite_result") {
      ack(attemptResult ?? { ok: false, code: "INVITE_NOT_FOUND" })
      return
    }
    ack({ ok: false, code: "UNEXPECTED_EVENT" })
  })
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
  __setInviteSfxDiagnosticsEnvForTests(null)
  resetInviteSfxDiagnostics()
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

  // 여기가 핵심이다: 복원이 해소되는 **그 순간** 버퍼에 있던 커서 이후 사건이 정확히 한 번
  // 울린다. 사건을 다시 쏘아 주지 않는다 — 재발행으로 소리를 만들면 "복원 중에 도착한
  // 신규 초대는 영원히 무음"이라는 실제 결함을 시험이 가려 버린다.
  assert.equal(h.media.length, 1, "복원이 끝나면 버퍼의 신규 초대가 재발행 없이 한 번 울려야 한다")
  assert.equal(
    useGameInviteStore.getState().soundConsumed.has("fresh"), true,
    "후보로 인정한 순간 표식을 소모해야 한다",
  )

  // 커서 이하(past)는 복원이 이미 알고 있었고, 이미 울린 fresh도 다시 울리지 않는다.
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(past))
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })

  assert.equal(h.media.length, 1, "재배달로 소리가 늘면 안 된다")
  await mounted.unmount()
})

test("AC-05: 복원은 취소된 과거 PENDING을 목록에서 내리고, 커서 이후 신규는 남긴다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const cancelled = invite({ inviteId: "cancelled", creationSeq: "30" })
  const alive = invite({ inviteId: "alive", creationSeq: "40" })
  snapshotResponder = async () => ({ invites: [cancelled, alive], cursor: "40" })

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })
  assert.equal(selectPendingInvites(useGameInviteStore.getState().invites).length, 2)

  // 차단으로 cancelled가 무효화됐다 — 서버 snapshot은 이제 그 행을 돌려주지 않는다.
  // 그 사이에 커서 **이후**의 새 초대가 하나 도착해 아직 조회 경계 밖에 있다.
  const brandNew = invite({ inviteId: "brand-new", creationSeq: "99" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(brandNew))
    await flush()
  })

  snapshotResponder = async () => ({ invites: [alive], cursor: "40" })
  await act(async () => {
    socket.__fire("friend_relation_invalidated", { reason: "BLOCKED" })
    await flush()
  })

  const ids = useGameInviteStore.getState().invites.map((row) => row.inviteId).sort()
  assert.deepEqual(
    ids, ["alive", "brand-new"],
    "snapshot에 없는 과거 PENDING은 처리 가능 상태로 남으면 안 된다(유령 초대)",
  )
  assert.deepEqual(
    selectPendingInvites(useGameInviteStore.getState().invites).map((row) => row.inviteId).sort(),
    ["alive", "brand-new"],
  )
  await mounted.unmount()
})

test("AC-05: 우리가 이미 아는 종료 이력은 복원이 지우지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [invite({ inviteId: "done", creationSeq: "10" })], cursor: "10" })

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  // 거절되어 terminal로 바뀌었다(무음 상태 변경).
  await act(async () => {
    socket.__fire("game_invite_updated", {
      invite: invite({ inviteId: "done", creationSeq: "10", status: "DECLINED", revision: 2 }),
    })
    await flush()
  })

  snapshotResponder = async () => ({ invites: [], cursor: "10" })
  await act(async () => {
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })

  const row = useGameInviteStore.getState().invites.find((item) => item.inviteId === "done")
  assert.ok(row, "종료 이력까지 사라지면 사용자는 무슨 일이 있었는지 알 수 없다")
  assert.equal(row.status, "DECLINED")
  assert.equal(selectPendingInvites(useGameInviteStore.getState().invites).length, 0)
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

  const room9 = { roomId: "room-9", roomCode: "ABCD", players: [] }
  const accepted = []
  respondToAccept(socket, {
    accept: (payload, ack) => { accepted.push(payload); ack({ ok: true, room: room9 }) },
    currentRoom: room9,
  })

  let result
  await act(async () => {
    result = await requestGameInviteAccept("go")
    await flush()
  })

  assert.deepEqual(accepted, [{ inviteId: "go" }])
  assert.equal(shouldEnterRoomFromAccept(result), true)
  assert.deepEqual(navigated, ["/game-matching"], "이동 소유자가 둘이면 두 번 이동한다")
  assert.equal(useMatchingStore.getState().roomId, "room-9")
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("go"), false)
  await mounted.unmount()
})

test("AC-06: ACK가 유실돼도 같은 시도의 durable 결과로 입장을 복구한다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [invite({ inviteId: "lost", creationSeq: "1" })], cursor: "1" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })

  const room7 = { roomId: "room-7", roomCode: "ZZZZ", players: [] }
  const lookups = []
  respondToAccept(socket, {
    // 서버는 실제로 입장시켰지만 응답 전달이 끊겼다 — 실패로 단정하면 안 된다.
    accept: (payload, ack) => ack({ ok: false, code: "UNKNOWN", unknown: true }),
    attemptResult: { ok: true, entered: true, room: room7 },
    currentRoom: room7,
  })
  const originalEmit = socket.emit
  socket.emit = (event, payload, ack) => { lookups.push(event); return originalEmit(event, payload, ack) }

  await act(async () => {
    await requestGameInviteAccept("lost")
    await flush()
  })

  assert.ok(lookups.includes("get_game_invite_result"), "ACK 유실 뒤 같은 시도의 결과를 되물어야 한다")
  assert.deepEqual(navigated, ["/game-matching"])
  assert.equal(useMatchingStore.getState().roomId, "room-7")
  await mounted.unmount()
})

test("AC-06: 재조회가 아직 진행 중이라고 답하면 성공으로도 실패로도 단정하지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [invite({ inviteId: "busy", creationSeq: "1" })], cursor: "1" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })

  respondToAccept(socket, {
    accept: (payload, ack) => ack({ ok: false, code: "UNKNOWN", unknown: true }),
    attemptResult: { ok: true, pending: true, entered: false },
  })

  let result
  await act(async () => {
    result = await requestGameInviteAccept("busy")
    await flush()
  })

  assert.deepEqual(navigated, [])
  assert.equal(result.unknown, true, "진행 중은 실패가 아니라 모름이다")
  assert.match(useGameInviteStore.getState().inviteErrors.busy, /확인하지 못했습니다/)
  await mounted.unmount()
})

test("AC-06: 성공 ACK라도 현재 소속이 그 방이 아니면 이동하지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [invite({ inviteId: "gone", creationSeq: "1" })], cursor: "1" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })
  const snapshotsBefore = apiCalls.snapshot

  // 영수증은 확정됐지만 그 사이 방이 시작·삭제되어 현재 소속이 사라졌다(A-10).
  respondToAccept(socket, {
    accept: (payload, ack) => ack({ ok: true, room: { roomId: "room-9", players: [] } }),
    currentRoom: null,
  })

  let result
  await act(async () => {
    result = await requestGameInviteAccept("gone")
    await flush()
  })

  assert.deepEqual(navigated, [], "역사적 성공만으로 옛 대기방에 들어가면 안 된다")
  assert.equal(result.code, "ROOM_NOT_CONFIRMED")
  assert.equal(useMatchingStore.getState().roomId, null)
  assert.ok(apiCalls.snapshot > snapshotsBefore, "확정하지 못했으면 서버 상태를 다시 읽는다")
  await mounted.unmount()
})

test("AC-06: 응답이 오는 사이 연결이 교체되면 그 ACK로 이동하지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [invite({ inviteId: "swap", creationSeq: "1" })], cursor: "1" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })

  const replacement = createFakeSocket()
  socket.__setAckResponder((event, payload, ack) => {
    if (event !== "accept_game_invite") { ack({ ok: false, code: "UNEXPECTED_EVENT" }); return }
    // 서버의 canonical 교체와 같은 순간: 이 ACK는 더 이상 현재 연결의 결과가 아니다.
    setSocket(replacement)
    ack({ ok: true, room: { roomId: "room-9", players: [] } })
  })

  let result
  await act(async () => {
    result = await requestGameInviteAccept("swap")
    await flush()
  })

  assert.deepEqual(navigated, [], "교체된 연결의 ACK로 이동하면 안 된다")
  assert.equal(result.code, "STALE_CONNECTION")
  assert.equal(useMatchingStore.getState().roomId, null)
  await mounted.unmount()
})

test("AC-06: 발송 멱등 키는 결과가 확정되기 전까지 같은 번호를 유지하고, 확정 뒤에만 넘어간다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const keys = []
  // 1) 응답 자체를 받지 못했다(네트워크) — status가 없다.
  createInviteResponder = async (receiverId, creationKey) => {
    keys.push(creationKey)
    throw new Error("network down")
  }
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  // 2) 같은 논리 발송의 재시도 — **같은 키**라야 서버가 두 번째 초대를 만들지 않는다.
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  assert.equal(keys[0], keys[1], "결과를 모르는 재시도가 새 키를 쓰면 초대가 두 개 생긴다")

  // 3) 서버가 결과를 확정했다 — 이 논리 발송은 끝났다.
  createInviteResponder = async (receiverId, creationKey) => {
    keys.push(creationKey)
    return invite({ inviteId: "sent", receiverId })
  }
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  assert.equal(keys[2], keys[1], "확정 전 재시도는 여전히 같은 키다")

  // 4) 초대가 끝난 뒤의 **의도적인 재초대**는 새 논리 발송이라 다음 번호로 넘어간다.
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  assert.notEqual(keys[3], keys[2], "종료 뒤 재초대가 옛 키에 갇히면 아무 일도 일어나지 않는다")

  // 5) 서버가 명시적으로 거부한 경우(status 있음)도 결과 확정이다.
  createInviteResponder = async (receiverId, creationKey) => {
    keys.push(creationKey)
    throw Object.assign(new Error("차단된 사용자입니다."), { status: 403 })
  }
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  assert.notEqual(keys[5], keys[4], "서버가 답한 거부 뒤에는 다음 논리 발송으로 넘어간다")

  // 다른 방이면 범위 자체가 다르다.
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-2:friend-1") })
  assert.ok(keys[6].startsWith("room-2:friend-1:"))
  await mounted.unmount()
})

test("AC-06: 5xx는 쓰기가 커밋되지 않았다는 증거가 아니므로 같은 키를 유지한다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const keys = []
  const respondWith = (status) => {
    createInviteResponder = async (receiverId, creationKey) => {
      keys.push(creationKey)
      throw Object.assign(new Error(`status ${status}`), { status })
    }
  }
  const send = () => act(async () => {
    await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1")
  })

  // 500은 "서버가 답했다"일 뿐 "쓰기를 하지 않았다"가 아니다 — 커밋 뒤 응답을 만들다
  // 터졌을 수도 있으므로 같은 키를 유지해야 재시도가 두 번째 초대를 만들지 않는다.
  respondWith(500)
  await send()
  await send()
  assert.equal(keys[1], keys[0], "정수 status가 있다는 이유만으로 키를 넘기면 초대가 두 개 생긴다")

  // 503·408·429도 같다 — 결과를 모른다.
  respondWith(503)
  await send()
  assert.equal(keys[2], keys[1])
  respondWith(429)
  await send()
  assert.equal(keys[3], keys[2])

  // 반대로 409는 그 키가 이미 다른 초대에 쓰였다는 확정 답이라 반드시 넘어가야 한다.
  respondWith(409)
  await send()
  assert.equal(keys[4], keys[3], "확정 답 자체는 아직 같은 키로 나간다")
  respondWith(409)
  await send()
  assert.notEqual(keys[5], keys[4], "키 충돌을 확인하고도 같은 키에 갇히면 영원히 초대할 수 없다")
  await mounted.unmount()
})

test("AC-06: 종료된 발송 뒤 계정을 나갔다 돌아오면 새 발송이 옛 서버 키를 재사용하지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  // 서버는 creation_key를 영속으로 기억한다 — 같은 키가 다시 오면 새 초대를 만들지 않고
  // 그때 만든 행을 그대로 돌려준다(실제 createInvite의 멱등 계약). 그 행이 이미 끝나
  // 있으면 사용자는 "초대했는데 아무 일도 안 일어나는" 화면을 본다.
  const keys = []
  const serverRows = new Map()
  createInviteResponder = async (receiverId, creationKey) => {
    keys.push(creationKey)
    if (!serverRows.has(creationKey)) {
      serverRows.set(creationKey, invite({
        inviteId: `row-${serverRows.size + 1}`, receiverId, status: "PENDING",
      }))
    }
    return serverRows.get(creationKey)
  }
  const send = () => act(async () => {
    await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1")
  })

  // 1) 발송이 확정되고, 2) 상대가 거절해 그 행이 종료됐다.
  await send()
  serverRows.get(keys[0]).status = "DECLINED"

  // 3) 로그아웃 → 다시 같은 계정으로 로그인. 계정 상태가 새로 만들어져 발송 번호는 1로
  //    돌아가지만 서버의 옛 키는 그대로 남아 있다.
  useAuthStore.setState({ isLoggedIn: false, user: null })
  useGameInviteStore.getState().syncAccount()
  signIn(ACCOUNT_A)
  useGameInviteStore.getState().syncAccount()

  // 4) 새로운 **의도적인** 초대.
  await send()

  assert.equal(keys.length, 2)
  assert.notEqual(keys[1], keys[0], "번호만 쓰면 로그아웃/로그인 뒤 옛 키가 그대로 되살아난다")
  assert.notEqual(
    serverRows.get(keys[1]).inviteId, serverRows.get(keys[0]).inviteId,
    "새 발송이 끝난 옛 초대를 돌려받으면 사용자는 아무 일도 일어나지 않는 화면을 본다",
  )
  assert.equal(serverRows.get(keys[1]).status, "PENDING")

  // 5) 새로고침(store 재구성)도 같은 lifecycle 경계다.
  useGameInviteStore.getState().__resetForTests()
  signIn(ACCOUNT_A)
  await send()
  assert.equal(keys.length, 3)
  assert.notEqual(keys[2], keys[1])
  assert.notEqual(keys[2], keys[0])

  // 6) 같은 lifecycle 안의 결과 미확정 재시도는 여전히 **정확히 같은 키**다.
  createInviteResponder = async (receiverId, creationKey) => {
    keys.push(creationKey)
    throw new Error("network down")
  }
  await send()
  await send()
  assert.equal(keys[4], keys[3], "lifecycle 표식이 재시도마다 바뀌면 멱등성이 깨진다")
  await mounted.unmount()
})

test("AC-06: 계정이 오간 사이 도착한 옛 수락 완료가 새 시도의 진행 표시를 풀지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  /** ACK를 시험이 열어 줄 때까지 붙잡아 둔다. */
  const holdAccept = () => {
    const held = deferred()
    socket.__setAckResponder((event, payload, ack) => {
      if (event === "accept_game_invite") {
        held.promise.then(() => ack({ ok: false, code: "REJECTED", message: "안 됩니다." }))
        return
      }
      ack({ ok: false, code: "UNEXPECTED_EVENT" })
    })
    return held
  }

  // (1) A의 첫 수락 — 응답을 붙잡아 둔다.
  const oldAck = holdAccept()
  let firstResult = null
  const first = requestGameInviteAccept("dup").then((r) => { firstResult = r })
  await act(async () => { await flush() })
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("dup"), true)

  // (2) A → B → A.
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT_B } })
  useGameInviteStore.getState().syncAccount()
  signIn(ACCOUNT_A)
  useGameInviteStore.getState().syncAccount()
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("dup"), false)

  // (3) 돌아온 A에서 같은 초대에 새 시도를 건다.
  const newAck = holdAccept()
  const second = requestGameInviteAccept("dup")
  await act(async () => { await flush() })
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("dup"), true)

  // (4) 이제 **옛** 시도의 응답이 도착한다.
  await act(async () => { oldAck.resolve(); await first; await flush() })

  assert.equal(firstResult.code, "STALE", "계정이 바뀐 뒤 도착한 결과는 새 화면을 건드리지 않는다")
  assert.equal(
    useGameInviteStore.getState().pendingInviteIds.has("dup"), true,
    "옛 완료가 새 시도의 진행 표시를 풀면 같은 초대에 두 번째 수락이 나간다",
  )

  // 새 시도가 끝나면 정상적으로 풀린다 — 소유 대조가 정상 해제까지 막지는 않는다.
  await act(async () => { newAck.resolve(); await second; await flush() })
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("dup"), false)
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

// ---------------------------------------------------------------------------
// AC-05 · 해소된 snapshot의 "처리 가능 목록"은 지식으로 남는다
//
// loadSnapshot이 유령 초대를 목록에서 내리기만 하고 그 사실을 기억하지 않으면, 뒤늦게
// 배달된 **지연 생성 사건**이 receiveLiveInvite를 통해 그 행을 다시 넣는다. 사용자는 이미
// 취소된 초대의 수락 버튼을 다시 보게 된다(CODEX-2).
// ---------------------------------------------------------------------------

const pendingIds = () =>
  selectPendingInvites(useGameInviteStore.getState().invites).map((row) => row.inviteId).sort()

test("AC-05: 취소가 확인된 뒤 지연 도착한 커서 이하 PENDING은 되살아나지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const ghost = invite({ inviteId: "ghost", creationSeq: "40" })
  snapshotResponder = async () => ({ invites: [ghost], cursor: "40" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })
  assert.deepEqual(pendingIds(), ["ghost"])

  // 차단으로 취소됐다 — 새 snapshot에는 없고 커서는 그대로다.
  snapshotResponder = async () => ({ invites: [], cursor: "40" })
  await act(async () => {
    socket.__fire("friend_relation_invalidated", { reason: "BLOCKED" })
    await flush()
  })
  assert.deepEqual(pendingIds(), [], "취소된 초대는 목록에서 내려가야 한다")

  // 이제 그 초대의 **지연 생성 사건**이 뒤늦게 배달된다(커서 이하).
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(ghost))
    await flush()
  })
  assert.deepEqual(
    pendingIds(), [],
    "snapshot이 없다고 확인해 준 행을 지연 사건이 처리 가능 상태로 되살렸다",
  )

  // 차단 해제로 다시 조회해도(과거 초대는 부활하지 않는다) 결과는 같다.
  snapshotResponder = async () => ({ invites: [], cursor: "40" })
  await act(async () => {
    socket.__fire("friend_relation_invalidated", { reason: "UNBLOCKED" })
    await flush()
    socket.__fire("game_invite_received", invitePayload(ghost))
    await flush()
  })
  assert.deepEqual(pendingIds(), [], "차단 해제만으로 과거 초대가 복원되면 안 된다")

  // 커서 **이후**의 진짜 신규 초대는 그대로 들어온다 — 무차별 억제가 아니다.
  const fresh = invite({ inviteId: "fresh", creationSeq: "41" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })
  assert.deepEqual(pendingIds(), ["fresh"])

  // 종료 상태 갱신은 계속 반영된다(이력을 최신으로 맞춘다).
  await act(async () => {
    socket.__fire("game_invite_updated", {
      invite: invite({ inviteId: "ghost", creationSeq: "40", status: "CANCELLED", revision: 3 }),
    })
    await flush()
  })
  assert.equal(
    useGameInviteStore.getState().invites.find((row) => row.inviteId === "ghost")?.status,
    "CANCELLED",
    "종료 갱신까지 막으면 이력이 낡은 채로 남는다",
  )
  assert.deepEqual(pendingIds(), ["fresh"])
  await mounted.unmount()
})

test("AC-05: 늦게 도착한 **오래된** snapshot이 커서와 처리 가능 지식을 되돌리지 못한다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const ghost = invite({ inviteId: "ghost", creationSeq: "40" })

  // 먼저 시작한 조회가 느리다 — 이 응답은 취소 **이전**의 사실을 담고 있다.
  const slow = deferred()
  snapshotResponder = () => slow.promise
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  // 그 사이 더 나중에 시작한 조회가 먼저 끝난다(이미 취소됨).
  snapshotResponder = async () => ({ invites: [], cursor: "40" })
  await act(async () => {
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })
  assert.deepEqual(pendingIds(), [])

  // 이제 오래된 응답이 도착한다.
  await act(async () => {
    slow.resolve({ invites: [ghost], cursor: "40" })
    await flush()
  })

  assert.equal(useGameInviteStore.getState().cursor, "40")
  assert.deepEqual(pendingIds(), [], "오래된 응답이 취소된 초대를 되살렸다")

  // 그 뒤의 지연 사건도 여전히 막힌다 — 지식이 되돌아가지 않았다는 뜻이다.
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(ghost))
    await flush()
  })
  assert.deepEqual(pendingIds(), [])
  await mounted.unmount()
})

// ---------------------------------------------------------------------------
// AC-07 · QA 진단은 실제 런타임을 **관찰만** 한다
//
// 배포 자산이 미검토라 실제 청음이 불가능하므로, 운영자가 브라우저에서 "신규 1회 판정 ·
// 복원 0회 · 억제 사유"를 확인할 수 있어야 한다. 아래는 그 기록이 실제 경로(훅 → store →
// F-16 재생기)가 내린 판정 그대로이고, 진단을 켜도 업무 경로가 그대로 끝나는지를 본다.
// ---------------------------------------------------------------------------

test("AC-07: QA 진단은 미검토 자산의 '적격 1 · 청음 0 · asset-unreviewed'를 그대로 적는다", async () => {
  signIn(ACCOUNT_A)
  // **배포 manifest 그대로** 쓴다 — fixture가 아니라 실제 미검토 자산 경로를 관찰한다.
  const runtime = installPlayer({
    manifest: SFX_MANIFEST,
    settings: { notifications: { "friend-invite": true } },
  })
  __setInviteSfxDiagnosticsEnvForTests(() => ({ dev: true, search: `?${INVITE_SFX_QA_FLAG}=1` }))

  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "5" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const fresh = invite({ inviteId: "diag-1", creationSeq: "9" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })

  assert.equal(runtime.media.length, 0, "미검토 자산은 매체를 만들지 않는다")

  const summary = summarizeInviteSfxObservations()
  assert.equal(summary.arrivals, 1)
  assert.equal(summary.eligibleDispatches, 1, "커서 이후의 진짜 신규 수신은 적격 1회여야 한다")
  assert.equal(summary.audiblePlaybacks, 0, "미검토 자산을 청음 1회로 적으면 거짓 증거가 된다")
  assert.equal(summary.suppressedByReason[SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED], 1)

  // 같은 초대가 다시 배달되면 적격 판정은 늘지 않고 사유만 남는다(복원·중복 0회의 근거).
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })
  const repeated = summarizeInviteSfxObservations()
  assert.equal(repeated.eligibleDispatches, 1, "중복 전달이 적격 판정을 늘리면 1회 계약이 깨진다")
  assert.equal(repeated.suppressedByReason["already-consumed"], 1)

  // 커서 이하의 과거 초대도 사유와 함께 무음으로 기록된다.
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "old", creationSeq: "3" })))
    await flush()
  })
  assert.equal(summarizeInviteSfxObservations().suppressedByReason["at-or-below-cursor"], 1)

  // 진단을 켜 둔 채로도 거절이 정상적으로 끝난다.
  declineResponder = async (inviteId) => ({
    ...fresh, inviteId, status: "DECLINED", revision: 2,
  })
  const declined = await useGameInviteStore.getState().declineInvite("diag-1")
  assert.equal(declined.ok, true, "진단이 업무 경로를 막으면 안 된다")
  assert.equal(apiCalls.decline, 1)

  await mounted.unmount()
})

test("AC-07: 진단이 꺼져 있으면 아무 기록도 남기지 않는다(기본값)", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "5" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "no-diag", creationSeq: "9" })))
    await flush()
  })

  assert.deepEqual(
    getInviteSfxObservations(), [],
    "opt-in 없이 관찰이 쌓이면 일반 사용자 세션에 내부 식별자가 남는다",
  )
  assert.deepEqual(pendingIds(), ["no-diag"], "진단 여부와 무관하게 초대 처리는 그대로다")
  await mounted.unmount()
})

// ---------------------------------------------------------------------------
// AC-07/RESULT-3 · 복원 순서는 **서버가 읽은 경계**가 정한다
//
// 예전에는 클라이언트의 요청 **시작 순서**만으로 판정했다. 그러나 나중에 시작한 요청이
// 서버에 먼저 도달해 먼저 읽힐 수 있다 — 그 응답의 커서가 더 작다. 시작 순서만 보면 그
// 뒤에 도착한 **더 새로운 서버 지식**이 superseded로 버려져, 그 사이에 생긴 초대를 잃고
// 커서도 낮은 값에 머문다(그러면 이후 사건 판정까지 어긋난다).
// ---------------------------------------------------------------------------

test("AC-07: 나중에 시작한 조회가 서버에서 먼저 읽혔어도 더 새로운 커서·행을 잃지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const older = invite({ inviteId: "older", creationSeq: "10" })
  const newer = invite({ inviteId: "newer", creationSeq: "40" })

  // 첫 번째 조회(마운트가 시작한다)는 **서버에서 늦게 읽힌다** — 커서 40, 두 행을 본다.
  const late = deferred()
  snapshotResponder = () => late.promise
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  // 두 번째 조회는 나중에 시작했지만 **서버에서 먼저 읽혀** 커서 10, 한 행만 본다.
  snapshotResponder = async () => ({ invites: [older], cursor: "10" })
  await act(async () => {
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })
  assert.equal(useGameInviteStore.getState().cursor, "10")
  assert.deepEqual(pendingIds(), ["older"])

  // 이제 첫 응답이 도착한다. 시작은 먼저였지만 서버 지식은 **더 새롭다**.
  await act(async () => {
    late.resolve({ invites: [older, newer], cursor: "40" })
    await flush()
  })

  assert.equal(
    useGameInviteStore.getState().cursor, "40",
    "시작 순서로만 판정하면 더 새로운 서버 지식이 버려져 커서가 낮은 값에 머문다",
  )
  assert.deepEqual(
    pendingIds().sort(), ["newer", "older"],
    "더 새로운 응답이 담고 있던 초대를 잃으면 화면에서 처리할 수 없다",
  )

  // 커서가 앞서 나갔으므로 그 이하의 지연 생성 사건은 여전히 무음·무반영이다.
  const cancelled = invite({ inviteId: "gone", creationSeq: "20" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(cancelled))
    await flush()
  })
  assert.deepEqual(pendingIds().sort(), ["newer", "older"])
  await mounted.unmount()
})

test("AC-07: 뒤처진 응답이 도착해도 복원 보류가 풀려 이후 신규 초대가 무음이 되지 않는다", async () => {
  signIn(ACCOUNT_A)
  const runtime = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  // 마운트 조회는 느리고(서버 읽기도 오래됨), 그 뒤 더 새로운 조회가 먼저 반영된다.
  const stale = deferred()
  snapshotResponder = () => stale.promise
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  snapshotResponder = async () => ({ invites: [], cursor: "50" })
  await act(async () => {
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })

  await act(async () => {
    stale.resolve({ invites: [], cursor: "20" })
    await flush()
  })

  const state = useGameInviteStore.getState()
  assert.equal(state.cursor, "50", "뒤처진 응답이 커서를 되돌리면 과거 사건이 신규로 보인다")
  assert.equal(state.restorePending, false, "복원 보류가 남으면 이후 신규 초대가 영원히 무음이다")
  assert.equal(state.status, "success")

  // 커서 이후의 진짜 신규 초대는 정상적으로 한 번 울린다.
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "fresh", creationSeq: "60" })))
    await flush()
  })
  assert.equal(runtime.media.length, 1, "복원 보류가 풀리지 않으면 여기서 0이 된다")
  assert.deepEqual(pendingIds(), ["fresh"])
  await mounted.unmount()
})

test("AC-07: 늦게 도착한 오래된 조회 **실패**가 이미 성공한 복원을 오류로 덮지 않는다", async () => {
  signIn(ACCOUNT_A)
  const runtime = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  // 마운트 조회가 느리게 실패한다.
  const failing = deferred()
  snapshotResponder = () => failing.promise
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  // 그 사이 나중에 시작한 조회가 성공해 복원을 끝낸다.
  snapshotResponder = async () => ({ invites: [], cursor: "30" })
  await act(async () => {
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })
  assert.equal(useGameInviteStore.getState().status, "success")

  await act(async () => {
    failing.reject(new Error("network down"))
    await flush()
  })

  const state = useGameInviteStore.getState()
  assert.equal(state.status, "success", "오래된 실패가 최신 성공을 오류로 덮었다")
  assert.equal(state.error, null)
  assert.equal(state.restorePending, false, "오래된 실패가 복원 보류를 다시 세우면 신규 초대가 무음이 된다")
  assert.equal(state.cursor, "30")

  // 복원이 살아 있으므로 커서 이후 신규 초대는 정상적으로 울린다.
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "after", creationSeq: "31" })))
    await flush()
  })
  assert.equal(runtime.media.length, 1)
  await mounted.unmount()
})

// ---------------------------------------------------------------------------
// AC-06 · 진행 표시는 **현재 방 확인까지** 유지된다
//
// 예전에는 수락 ACK 직후 finally에서 표시를 내렸다. 그 뒤의 get_current_room 대조·이동
// 결정 구간에서 두 번째 클릭이 통과해 같은 초대에 수락이 두 번 나갈 수 있었다(CODEX-2).
// ---------------------------------------------------------------------------

test("AC-06: 현재 방 확인을 기다리는 동안 두 번째 수락은 IN_PROGRESS이고 두 번째 emit이 없다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })

  // 수락 ACK는 즉시 성공이지만 현재 방 확인은 시험이 열어 줄 때까지 붙잡아 둔다.
  const roomGate = deferred()
  socket.__setAckResponder((event, payload, ack) => {
    if (event === "accept_game_invite") {
      ack({ ok: true, room: { roomId: "room-1" }, inviteId: "invite-1" })
      return
    }
    if (event === "get_current_room") {
      roomGate.promise.then(() => ack({ ok: true, room: { roomId: "room-1" } }))
      return
    }
    ack({ ok: false, code: "UNEXPECTED_EVENT" })
  })

  let firstResult = null
  const first = requestGameInviteAccept("invite-1").then((r) => { firstResult = r })
  await act(async () => { await flush() })

  assert.equal(
    useGameInviteStore.getState().pendingInviteIds.has("invite-1"), true,
    "수락 ACK를 받았다고 끝난 것이 아니다 — 현재 방 확인까지가 한 번의 수락이다",
  )

  const second = await requestGameInviteAccept("invite-1")
  assert.equal(second.code, "IN_PROGRESS")
  assert.equal(
    socket.__emits.filter((e) => e.event === "accept_game_invite").length, 1,
    "확인 대기 중 두 번째 수락이 서버로 나갔다",
  )

  await act(async () => { roomGate.resolve(); await first; await flush() })

  assert.equal(firstResult.ok, true)
  assert.deepEqual(navigated, ["/game-matching"], "확정 입장은 정확히 한 번 이동한다")
  assert.equal(
    useGameInviteStore.getState().pendingInviteIds.has("invite-1"), false,
    "끝난 뒤에는 정상적으로 풀려야 한다",
  )
  await mounted.unmount()
})
