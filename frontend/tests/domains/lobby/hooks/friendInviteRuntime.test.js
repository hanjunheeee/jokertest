import test, { mock } from "node:test"
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
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let snapshotResponder = async () => ({ invites: [], cursor: "0" })
let declineResponder = async (inviteId) => ({ inviteId })
let createInviteResponder = async () => ({})
const apiCalls = { snapshot: 0, decline: 0, create: 0 }

mock.module("../../../../src/domains/lobby/api/friend.api.js", {
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

const {
  useFriendSocketEvents,
  requestGameInviteAccept,
  shouldEnterRoomFromAccept,
  loadInviteSnapshotAndPlayNew,
} = await import("../../../../src/domains/lobby/hooks/useFriendSocketEvents.js")
const { useGameInviteStore, selectPendingInvites } = await import("../../../../src/domains/lobby/store/gameInvite.store.js")
const { useFriendStore } = await import("../../../../src/domains/lobby/store/friend.store.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { useMatchingStore } = await import("../../../../src/domains/game/matching/store/matchingStore.js")
const { useInGameStore } = await import("../../../../src/domains/game/ingame/store/ingameStore.js")
const { setSocket } = await import("../../../../src/shared/socket/socketClient.js")
const { __setSfxPlayerForTests } = await import("../../../../src/shared/hooks/useSfxRuntime.js")
const { createSfxPlayer } = await import("../../../../src/shared/audio/sfxPlayer.js")
const {
  SFX_MANIFEST,
  SFX_CLASSIFICATION,
  SFX_REVIEW_STATUS,
  SFX_SCOPE,
  SFX_SUPPRESSED_REASON,
  checkSfxAssetAllowed,
} = await import("../../../../src/shared/audio/sfxManifest.js")
const {
  INVITE_SFX_QA_FLAG,
  __setInviteSfxDiagnosticsEnvForTests,
  getInviteSfxObservations,
  resetInviteSfxDiagnostics,
  summarizeInviteSfxObservations,
} = await import("../../../../src/domains/lobby/diagnostics/inviteSfxDiagnostics.js")

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111"
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222"

const FIXTURE_HASH = "sha256-fixture-invite"

const GAME_INVITE_NOTIFICATION_KEY = SFX_MANIFEST["game-invite"].notificationKey

const FIXTURE_MANIFEST = {
  "game-invite": {
    scope: SFX_SCOPE.ACCOUNT,
    notificationKey: GAME_INVITE_NOTIFICATION_KEY,
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

function installPlayer(overrides = {}) {
  const createMedia = overrides.createMedia ?? createMediaRecorder()
  const settings = {
    masterVolume: 100,
    sfxVolume: 80,
    sfxMuted: false,
    notifications: { "friend-invite": true, [GAME_INVITE_NOTIFICATION_KEY]: true },
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

test("A-07(2026-09-22 개정): 배포 manifest의 game-invite는 자작 합성 승인 자산이고 실제 해시가 맞을 때만 매체를 만든다", async () => {
  const entry = SFX_MANIFEST["game-invite"]
  assert.ok(entry, "배포 manifest에 game-invite 항목이 있어야 한다")
  assert.equal(entry.scope, SFX_SCOPE.ACCOUNT)
  assert.equal(entry.notificationKey, "game-invite")
  assert.equal(entry.reviewStatus, SFX_REVIEW_STATUS.APPROVED)
  assert.equal(entry.src, "/sfx/game-invite.wav")
  assert.match(entry.sha256, /^[0-9a-f]{64}$/)
  assert.equal(checkSfxAssetAllowed(entry).allowed, true)

  signIn(ACCOUNT_A)
  const wrong = installPlayer({ manifest: SFX_MANIFEST, loadAsset: async () => ({ sha256: "0".repeat(64), src: entry.src }) })
  wrong.player.dispatch({ kind: "game-invite", eventId: "game-invite:x:received", accountId: ACCOUNT_A, origin: "live" })
  await flush()
  assert.equal(wrong.media.length, 0, "해시가 다른 바이트로 매체를 만들면 안 된다")
  assert.equal(wrong.player.getSilenceLog().at(-1)?.reason, SFX_SUPPRESSED_REASON.ASSET_HASH_MISMATCH)

  const right = installPlayer({ manifest: SFX_MANIFEST, loadAsset: async (e) => ({ sha256: e.sha256, src: e.src }) })
  const result = right.player.dispatch({ kind: "game-invite", eventId: "game-invite:y:received", accountId: ACCOUNT_A, origin: "live" })
  await flush()
  assert.notEqual(result.status, "suppressed", "승인 자산이 억제됐다: " + result.reason)
  assert.equal(right.media.length, 1)
})

test("AC-07: 복원 중에 온 사건은 보류됐다가 커서 이후의 것만 한 번 울린다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

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

  assert.equal(h.media.length, 1, "복원이 끝나면 버퍼의 신규 초대가 재발행 없이 한 번 울려야 한다")
  assert.equal(
    useGameInviteStore.getState().soundConsumed.has("fresh"), true,
    "후보로 인정한 순간 표식을 소모해야 한다",
  )

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(past))
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })

  assert.equal(h.media.length, 1, "재배달로 소리가 늘면 안 된다")
  await mounted.unmount()
})

test("AC-07: 재조회 중에 도착한 커서 이후 신규 초대는 복원이 끝난 뒤 정확히 한 번 울린다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  snapshotResponder = async () => ({ invites: [], cursor: "100" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })
  assert.equal(useGameInviteStore.getState().snapshotLoaded, true)
  assert.equal(useGameInviteStore.getState().restorePending, false)
  assert.equal(useGameInviteStore.getState().cursor, "100")

  const gate = deferred()
  snapshotResponder = () => gate.promise
  let requery
  await act(async () => {
    requery = loadInviteSnapshotAndPlayNew()
    await flush()
  })
  assert.equal(useGameInviteStore.getState().restorePending, true, "재조회는 복원 보류를 세운다")
  assert.equal(useGameInviteStore.getState().snapshotLoaded, true, "재조회는 snapshotLoaded를 내리지 않는다")

  const fresh = invite({ inviteId: "fresh-requery", creationSeq: "150" })
  const historical = invite({ inviteId: "stale-row", creationSeq: "60" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(fresh))
    socket.__fire("game_invite_received", invitePayload(historical))
    await flush()
  })
  assert.equal(h.media.length, 0, "복원 보류 중에는 소리 판정을 미룬다")

  await act(async () => {
    gate.resolve({ invites: [], cursor: "100" })
    await requery
    await flush()
  })

  const state = useGameInviteStore.getState()
  assert.equal(state.restorePending, false)
  assert.equal(h.media.length, 1, "재조회 중에 도착한 신규 초대의 소리 봉투를 잃었다")
  assert.equal(state.soundConsumed.has("fresh-requery"), true, "후보로 인정한 순간 표식을 소모해야 한다")
  assert.equal(
    selectPendingInvites(state.invites).some((row) => row.inviteId === "fresh-requery"), true,
    "보류가 목록 반영까지 막으면 재조회 중에 온 초대를 수락할 수 없다",
  )
  assert.equal(
    state.invites.some((row) => row.inviteId === "stale-row"), false,
    "커서 이하인데 snapshot에 없는 PENDING은 이미 종료된 행이다",
  )

  h.setSettings({ notifications: { [GAME_INVITE_NOTIFICATION_KEY]: false } })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })
  h.setSettings({ notifications: { [GAME_INVITE_NOTIFICATION_KEY]: true } })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })
  assert.equal(h.media.length, 1, "off/mute 재배달로 소리가 늘면 안 된다")
  await mounted.unmount()
})

test("AC-07: 재조회 중에 도착한 신규 초대의 보류된 봉투는 다른 계정으로 넘어가지 않는다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "100" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const gate = deferred()
  snapshotResponder = () => gate.promise
  let requery
  await act(async () => { requery = loadInviteSnapshotAndPlayNew(); await flush() })

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "a-only", creationSeq: "150" })))
    await flush()
  })

  signIn(ACCOUNT_B)
  await act(async () => {
    gate.resolve({ invites: [], cursor: "100" })
    await requery
    await flush()
  })

  assert.equal(h.media.length, 0, "계정 전환 뒤에 이전 계정의 보류된 봉투가 울렸다")
  assert.equal(
    useGameInviteStore.getState().invites.some((row) => row.inviteId === "a-only"), false,
    "이전 계정의 초대가 새 계정 상태에 남으면 안 된다",
  )
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
    socket.__fire("game_invite_updated", { invite: { ...row, revision: 2, status: "PENDING" } })
    await flush()
  })

  assert.equal(h.media.length, 1)

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
    socket.__fire("game_invite_received", invitePayload(forOther, ACCOUNT_B))
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

  snapshotResponder = async () => ({ invites: [], cursor: "0" })
  await act(async () => {
    signIn(ACCOUNT_B)
    await flush()
  })

  const state = useGameInviteStore.getState()
  assert.equal(state.accountId, ACCOUNT_B)
  assert.deepEqual(state.invites, [], "이전 계정의 초대가 새 계정 화면에 남았다")
  assert.equal(state.cursor, "0")

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(rowA, ACCOUNT_A))
    await flush()
  })
  assert.deepEqual(useGameInviteStore.getState().invites, [])
  assert.equal(h.media.length, 0)

  await act(async () => {
    useAuthStore.setState({ isLoggedIn: false, user: null })
    await flush()
  })
  assert.equal(useGameInviteStore.getState().accountId, null)
  await mounted.unmount()
})

test("A-03: 알림 off·mute여도 표식을 소모해 설정을 켠 뒤 과거 사건이 울리지 않는다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer({ settings: { notifications: { [GAME_INVITE_NOTIFICATION_KEY]: false } } })
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
  assert.equal(useGameInviteStore.getState().invites.length, 1)
  assert.equal(
    useGameInviteStore.getState().soundConsumed.has("muted"), true,
    "off여도 표식을 소모해야 설정을 켠 뒤 과거 사건이 울리지 않는다",
  )

  h.setSettings({ notifications: { [GAME_INVITE_NOTIFICATION_KEY]: true } })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(row))
    await flush()
  })
  assert.equal(h.media.length, 0, "설정을 켜자 과거 사건이 울렸다")
  await mounted.unmount()
})

test("AC-07: 게임 초대 소리는 '게임 초대' 설정만 따르고 친구 요청 설정과 독립이다", async () => {
  signIn(ACCOUNT_A)

  const off = installPlayer({ settings: { notifications: { "game-invite": false, "friend-invite": true } } })
  const socketOff = createFakeSocket()
  setSocket(socketOff)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })
  const mountedOff = await mountHook(socketOff)
  await act(async () => { await flush() })
  await act(async () => {
    socketOff.__fire("game_invite_received", invitePayload(invite({ inviteId: "g-off", creationSeq: "11" })))
    await flush()
  })
  assert.equal(off.media.length, 0, "'게임 초대'를 껐는데도 게임 초대가 울렸다")
  await mountedOff.unmount()

  resetAll()
  signIn(ACCOUNT_A)
  const on = installPlayer({ settings: { notifications: { "game-invite": true, "friend-invite": false } } })
  const socketOn = createFakeSocket()
  setSocket(socketOn)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })
  const mountedOn = await mountHook(socketOn)
  await act(async () => { await flush() })
  await act(async () => {
    socketOn.__fire("game_invite_received", invitePayload(invite({ inviteId: "g-on", creationSeq: "11" })))
    await flush()
  })
  assert.equal(on.media.length, 1, "'친구 초대'를 껐다는 이유로 게임 초대까지 조용해졌다")
  await mountedOn.unmount()
})

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
  createInviteResponder = async (receiverId, creationKey) => {
    keys.push(creationKey)
    throw new Error("network down")
  }
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  assert.equal(keys[0], keys[1], "결과를 모르는 재시도가 새 키를 쓰면 초대가 두 개 생긴다")

  createInviteResponder = async (receiverId, creationKey) => {
    keys.push(creationKey)
    return invite({ inviteId: "sent", receiverId })
  }
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  assert.equal(keys[2], keys[1], "확정 전 재시도는 여전히 같은 키다")

  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  assert.notEqual(keys[3], keys[2], "종료 뒤 재초대가 옛 키에 갇히면 아무 일도 일어나지 않는다")

  createInviteResponder = async (receiverId, creationKey) => {
    keys.push(creationKey)
    throw Object.assign(new Error("차단된 사용자입니다."), { status: 403 })
  }
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  await act(async () => { await useGameInviteStore.getState().sendInvite("friend-1", "room-1:friend-1") })
  assert.notEqual(keys[5], keys[4], "서버가 답한 거부 뒤에는 다음 논리 발송으로 넘어간다")

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

  respondWith(500)
  await send()
  await send()
  assert.equal(keys[1], keys[0], "정수 status가 있다는 이유만으로 키를 넘기면 초대가 두 개 생긴다")

  respondWith(503)
  await send()
  assert.equal(keys[2], keys[1])
  respondWith(429)
  await send()
  assert.equal(keys[3], keys[2])

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

  await send()
  serverRows.get(keys[0]).status = "DECLINED"

  useAuthStore.setState({ isLoggedIn: false, user: null })
  useGameInviteStore.getState().syncAccount()
  signIn(ACCOUNT_A)
  useGameInviteStore.getState().syncAccount()

  await send()

  assert.equal(keys.length, 2)
  assert.notEqual(keys[1], keys[0], "번호만 쓰면 로그아웃/로그인 뒤 옛 키가 그대로 되살아난다")
  assert.notEqual(
    serverRows.get(keys[1]).inviteId, serverRows.get(keys[0]).inviteId,
    "새 발송이 끝난 옛 초대를 돌려받으면 사용자는 아무 일도 일어나지 않는 화면을 본다",
  )
  assert.equal(serverRows.get(keys[1]).status, "PENDING")

  useGameInviteStore.getState().__resetForTests()
  signIn(ACCOUNT_A)
  await send()
  assert.equal(keys.length, 3)
  assert.notEqual(keys[2], keys[1])
  assert.notEqual(keys[2], keys[0])

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

  const oldAck = holdAccept()
  let firstResult = null
  const first = requestGameInviteAccept("dup").then((r) => { firstResult = r })
  await act(async () => { await flush() })
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("dup"), true)

  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ACCOUNT_B } })
  useGameInviteStore.getState().syncAccount()
  signIn(ACCOUNT_A)
  useGameInviteStore.getState().syncAccount()
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("dup"), false)

  const newAck = holdAccept()
  const second = requestGameInviteAccept("dup")
  await act(async () => { await flush() })
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("dup"), true)

  await act(async () => { oldAck.resolve(); await first; await flush() })

  assert.equal(firstResult.code, "STALE", "계정이 바뀐 뒤 도착한 결과는 새 화면을 건드리지 않는다")
  assert.equal(
    useGameInviteStore.getState().pendingInviteIds.has("dup"), true,
    "옛 완료가 새 시도의 진행 표시를 풀면 같은 초대에 두 번째 수락이 나간다",
  )

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

  socket.__setAckResponder((event, payload, ack) => ack({ ok: false, code: "ROOM_FULL", message: "방이 가득 찼습니다." }))

  await act(async () => {
    await requestGameInviteAccept("no")
    await flush()
  })

  assert.deepEqual(navigated, [], "실패 ACK로 이동하면 안 된다")
  assert.equal(useGameInviteStore.getState().inviteErrors.no, "방이 가득 찼습니다.")
  assert.ok(apiCalls.snapshot > snapshotsBefore, "실패 뒤 서버 상태를 다시 읽어야 한다")

  assert.equal(shouldEnterRoomFromAccept({ ok: true, room: null }), false)
  assert.equal(shouldEnterRoomFromAccept({ ok: true, entryOutcome: "PUBLISHED" }), false)
  assert.equal(shouldEnterRoomFromAccept({ ok: false, room: { roomId: "x" } }), false)
  await mounted.unmount()
})

test("AC-07: 재생이 던지거나 영원히 끝나지 않아도 수락·거절과 상태 갱신이 완료된다", async () => {
  signIn(ACCOUNT_A)
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
  assert.equal(useGameInviteStore.getState().invites.length, 1)

  socket.__setAckResponder((event, payload, ack) => ack({ ok: true, room: { roomId: "room-ok", players: [] } }))
  await act(async () => {
    await requestGameInviteAccept("resilient")
    await flush()
  })
  assert.deepEqual(navigated, ["/game-matching"], "재생 실패가 입장을 막았다")

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

test("AC-01/A-02: 언마운트는 자기 리스너만 떼고 방코드 입장은 초대 수신이 아니다", async () => {
  signIn(ACCOUNT_A)
  const h = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  let otherCalls = 0
  const otherHandler = () => { otherCalls += 1 }
  socket.on("connect", otherHandler)

  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  assert.equal(socket.__listenerCount("connect"), 2)
  assert.equal(socket.__listenerCount("room_joined"), 0)
  await act(async () => {
    socket.__fire("room_joined", { room: { roomId: "r" } })
    await flush()
  })
  assert.equal(h.media.length, 0, "방 코드 입장이 초대 소리를 냈다")

  await mounted.unmount()

  assert.equal(socket.__listenerCount("connect"), 1)
  assert.equal(socket.__listenerCount("game_invite_received"), 0)
  await act(async () => {
    socket.__fire("connect")
    await flush()
  })
  assert.equal(otherCalls, 1, "다른 구독자의 리스너까지 지워졌다")
})

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

  snapshotResponder = async () => ({ invites: [], cursor: "40" })
  await act(async () => {
    socket.__fire("friend_relation_invalidated", { reason: "BLOCKED" })
    await flush()
  })
  assert.deepEqual(pendingIds(), [], "취소된 초대는 목록에서 내려가야 한다")

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(ghost))
    await flush()
  })
  assert.deepEqual(
    pendingIds(), [],
    "snapshot이 없다고 확인해 준 행을 지연 사건이 처리 가능 상태로 되살렸다",
  )

  snapshotResponder = async () => ({ invites: [], cursor: "40" })
  await act(async () => {
    socket.__fire("friend_relation_invalidated", { reason: "UNBLOCKED" })
    await flush()
    socket.__fire("game_invite_received", invitePayload(ghost))
    await flush()
  })
  assert.deepEqual(pendingIds(), [], "차단 해제만으로 과거 초대가 복원되면 안 된다")

  const fresh = invite({ inviteId: "fresh", creationSeq: "41" })
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })
  assert.deepEqual(pendingIds(), ["fresh"])

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

  const slow = deferred()
  snapshotResponder = () => slow.promise
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  snapshotResponder = async () => ({ invites: [], cursor: "40" })
  await act(async () => {
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })
  assert.deepEqual(pendingIds(), [])

  await act(async () => {
    slow.resolve({ invites: [ghost], cursor: "40" })
    await flush()
  })

  assert.equal(useGameInviteStore.getState().cursor, "40")
  assert.deepEqual(pendingIds(), [], "오래된 응답이 취소된 초대를 되살렸다")

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(ghost))
    await flush()
  })
  assert.deepEqual(pendingIds(), [])
  await mounted.unmount()
})

test("AC-07: QA 진단은 미검토 자산(시험 fixture)의 '적격 1 · 청음 0 · asset-unreviewed'를 그대로 적는다", async () => {
  signIn(ACCOUNT_A)
  const runtime = installPlayer({
    manifest: { ...SFX_MANIFEST, "game-invite": { ...SFX_MANIFEST["game-invite"], reviewStatus: SFX_REVIEW_STATUS.NEEDS_REVIEW, src: null, sha256: null, silenceReason: "시험 fixture" } },
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

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(fresh))
    await flush()
  })
  const repeated = summarizeInviteSfxObservations()
  assert.equal(repeated.eligibleDispatches, 1, "중복 전달이 적격 판정을 늘리면 1회 계약이 깨진다")
  assert.equal(repeated.suppressedByReason["already-consumed"], 1)

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "old", creationSeq: "3" })))
    await flush()
  })
  assert.equal(summarizeInviteSfxObservations().suppressedByReason["at-or-below-cursor"], 1)

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

test("AC-07: 나중에 시작한 조회가 서버에서 먼저 읽혔어도 더 새로운 커서·행을 잃지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const older = invite({ inviteId: "older", creationSeq: "10" })
  const newer = invite({ inviteId: "newer", creationSeq: "40" })

  const late = deferred()
  snapshotResponder = () => late.promise
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  snapshotResponder = async () => ({ invites: [older], cursor: "10" })
  await act(async () => {
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })
  assert.equal(useGameInviteStore.getState().cursor, "10")
  assert.deepEqual(pendingIds(), ["older"])

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

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "fresh", creationSeq: "60" })))
    await flush()
  })
  assert.equal(runtime.media.length, 1, "복원 보류가 풀리지 않으면 여기서 0이 된다")
  assert.deepEqual(pendingIds(), ["fresh"])
  await mounted.unmount()
})

async function reproduceSameCursorRace(order) {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const ghost = invite({ inviteId: "ghost", creationSeq: "40" })
  snapshotResponder = async () => ({ invites: [ghost], cursor: "40" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })
  assert.equal(
    selectPendingInvites(useGameInviteStore.getState().invites).length, 1,
    "출발점에서 ghost가 처리 가능해야 이 시험이 의미가 있다",
  )

  const first = deferred()
  const second = deferred()
  const queue = [first.promise, second.promise]
  let index = 0
  snapshotResponder = () => queue[index++]

  let pFirst
  let pSecond
  await act(async () => {
    pFirst = loadInviteSnapshotAndPlayNew()
    pSecond = loadInviteSnapshotAndPlayNew()
    await flush()
  })

  const stalePending = { promise: pSecond, gate: second, data: { invites: [ghost], cursor: "40" } }
  const freshEmpty = { promise: pFirst, gate: first, data: { invites: [], cursor: "40" } }
  const settle = order === "stale-first" ? [stalePending, freshEmpty] : [freshEmpty, stalePending]

  for (const step of settle) {
    await act(async () => {
      step.gate.resolve(step.data)
      await step.promise
      await flush()
    })
  }

  assert.deepEqual(
    selectPendingInvites(useGameInviteStore.getState().invites), [],
    "같은 커서의 다른 조회가 '없다'고 확인해 준 PENDING이 되살아났다",
  )
  assert.equal(useGameInviteStore.getState().cursor, "40", "커서를 되돌리면 안 된다")
  await mounted.unmount()
}

test("review5 #6: 같은 커서의 두 조회가 역순으로 읽혀도 취소된 초대가 되살아나지 않는다(오래된 응답이 먼저 도착)", async () => {
  await reproduceSameCursorRace("stale-first")
})

test("review5 #6: 같은 커서의 두 조회가 역순으로 읽혀도 취소된 초대가 되살아나지 않는다(오래된 응답이 나중에 도착)", async () => {
  await reproduceSameCursorRace("stale-last")
})

test("review5 #6: 같은 커서 병합이 정당한 신규 초대나 더 새로운 커서를 잃지 않는다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const older = invite({ inviteId: "older", creationSeq: "40" })
  snapshotResponder = async () => ({ invites: [older], cursor: "40" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

  const fresh = invite({ inviteId: "fresh", creationSeq: "70" })
  snapshotResponder = async () => ({ invites: [older, fresh], cursor: "70" })
  await act(async () => { await loadInviteSnapshotAndPlayNew(); await flush() })

  assert.deepEqual(
    selectPendingInvites(useGameInviteStore.getState().invites).map((row) => row.inviteId).sort(),
    ["fresh", "older"],
    "커서가 오른 조회는 그대로 권위를 가져야 한다",
  )
  assert.equal(useGameInviteStore.getState().cursor, "70")
  await mounted.unmount()
})

test("AC-07: 늦게 도착한 오래된 조회 **실패**가 이미 성공한 복원을 오류로 덮지 않는다", async () => {
  signIn(ACCOUNT_A)
  const runtime = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)

  const failing = deferred()
  snapshotResponder = () => failing.promise
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })

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

  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "after", creationSeq: "31" })))
    await flush()
  })
  assert.equal(runtime.media.length, 1)
  await mounted.unmount()
})

test("AC-06: 현재 방 확인을 기다리는 동안 두 번째 수락은 IN_PROGRESS이고 두 번째 emit이 없다", async () => {
  signIn(ACCOUNT_A)
  installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "0" })

  const navigated = []
  const mounted = await mountHook(socket, (path) => navigated.push(path))
  await act(async () => { await flush() })

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

test("AC-07: operator reconnect preserves confirmed cursor against a delayed lower snapshot", async () => {
  signIn(ACCOUNT_A)
  const runtime = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "50" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })
  assert.equal(useGameInviteStore.getState().cursor, "50")
  await act(async () => {
    useGameInviteStore.getState().beginResync()
    snapshotResponder = async () => ({ invites: [], cursor: "20" })
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })
  assert.equal(useGameInviteStore.getState().cursor, "50", "reconnect must not erase confirmed server knowledge")
  assert.equal(useGameInviteStore.getState().restorePending, false)
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "cancelled-before-reconnect", creationSeq: "40" })))
    await flush()
  })
  assert.deepEqual(pendingIds(), [], "old terminal invite cannot resurrect after reconnect")
  assert.equal(runtime.media.length, 0)
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "new-after-reconnect", creationSeq: "60" })))
    await flush()
  })
  assert.deepEqual(pendingIds(), ["new-after-reconnect"])
  assert.equal(runtime.media.length, 1, "new invitation remains eligible")
  await mounted.unmount()
})

test("AC-05: reconnect preserves terminal knowledge against a delayed same-cursor PENDING snapshot", async () => {
  signIn(ACCOUNT_A)
  const runtime = installPlayer()
  const socket = createFakeSocket()
  setSocket(socket)
  snapshotResponder = async () => ({ invites: [], cursor: "50" })
  const mounted = await mountHook(socket)
  await act(async () => { await flush() })
  assert.equal(useGameInviteStore.getState().cursor, "50")
  await act(async () => {
    useGameInviteStore.getState().beginResync()
    snapshotResponder = async () => ({ invites: [invite({ inviteId: "cancelled-before-reconnect", creationSeq: "40" })], cursor: "50" })
    await useGameInviteStore.getState().loadSnapshot()
    await flush()
  })
  assert.equal(useGameInviteStore.getState().cursor, "50", "reconnect must not erase confirmed server knowledge")
  assert.equal(useGameInviteStore.getState().restorePending, false)
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "cancelled-before-reconnect", creationSeq: "40" })))
    await flush()
  })
  assert.deepEqual(pendingIds(), [], "old terminal invite cannot resurrect after reconnect")
  assert.equal(runtime.media.length, 0)
  await act(async () => {
    socket.__fire("game_invite_received", invitePayload(invite({ inviteId: "new-after-reconnect", creationSeq: "60" })))
    await flush()
  })
  assert.deepEqual(pendingIds(), ["new-after-reconnect"])
  assert.equal(runtime.media.length, 1, "new invitation remains eligible")
  await mounted.unmount()
})
