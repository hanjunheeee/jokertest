import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"
import { register } from "node:module"
import { createRequire } from "node:module"
import React from "react"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
installDomGlobal("IntersectionObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function createIntegrationCanvasContext(canvas) {
  return {
    canvas,
    drawImage() {},
    getImageData(x, y, w, h) {
      return { data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h }
    },
    createImageData(w, h) {
      return { data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h }
    },
    putImageData() {},
  }
}
let integrationCanvasContextFactory = (canvas) => createIntegrationCanvasContext(canvas)
dom.window.HTMLCanvasElement.prototype.getContext = function fakeGetContext(type) {
  if (type !== "2d") return null
  return integrationCanvasContextFactory(this)
}
installDomGlobal("HTMLCanvasElement", dom.window.HTMLCanvasElement)
function resetIntegrationCanvasContextFactory() {
  integrationCanvasContextFactory = (canvas) => createIntegrationCanvasContext(canvas)
}

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../src/domains/game/ingame/utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `dummy-portrait-${index}` },
})
mock.module("../../../../src/domains/game/ingame/utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGameJobPortrait: (index) => `dummy-portrait-${index}`,
    pickInGamePlayerFrame: (index) => `dummy-frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc, status) => (status === "dead" ? `${frameSrc}-dead` : frameSrc),
    resolveAccountCardFrameSrc: () => null,
  },
})

mock.module("../../../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
mock.module("@/shared/api/client.js", {
  namedExports: {
    api: {
      get: async () => { throw new Error("network disabled in test") },
      post: async () => { throw new Error("network disabled in test") },
      put: async () => { throw new Error("network disabled in test") },
      patch: async () => { throw new Error("network disabled in test") },
      delete: async () => { throw new Error("network disabled in test") },
    },
    apiClient: async () => { throw new Error("network disabled in test") },
    refreshAccessToken: async () => { throw new Error("network disabled in test") },
  },
})

let currentSocket = null
const socketSubscribers = new Set()
mock.module("@/shared/socket/socketClient.js", {
  namedExports: {
    getSocket: () => currentSocket,
    subscribeSocket: (cb) => { socketSubscribers.add(cb); return () => socketSubscribers.delete(cb) },
    setSocket: (next) => {
      currentSocket = next
      for (const cb of [...socketSubscribers]) cb()
    },
  },
})

const { renderHook, render, cleanup, fireEvent } = await import("@testing-library/react")
const { MemoryRouter, RouterProvider, createMemoryRouter } = await import("react-router-dom")
const {
  useInGameStore, readInGameReceiptScope, selectNightSuccessQueue,
} = await import("../../../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { useSettingsStore } = await import("../../../../src/domains/settings/store/settingsStore.js")
const { useBgmAutoplay } = await import("../../../../src/shared/hooks/useBgmAutoplay.js")
const { setSocket } = await import("../../../../src/shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { useInGameSessionSnapshotSync } = await import("../../../../src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js")
const { useInGameNightSuccessPresentation } = await import("../../../../src/domains/game/ingame/hooks/useInGameNightSuccessPresentation.js")
const {
  INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS,
  INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR, INGAME_KILL_REVEAL_SKIP_LABEL,
} = await import("../../../../src/domains/game/ingame/constants/killReveal/ingameKillReveal.js")
const { INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE } = await import("../../../../src/domains/game/ingame/components/InGameNightPresentationWait.jsx")
const { default: InGamePage } = await import("../../../../src/domains/game/ingame/pages/InGamePage.jsx")
const { router } = await import("../../../../src/app/routes/index.jsx")
const { useMatchingStore } = await import("../../../../src/domains/game/matching/store/matchingStore.js")
const { getInGameRoleRevealInfo } = await import("../../../../src/domains/game/ingame/utils/getInGameRoleRevealInfo.js")

const flushMicrotasks = () => new Promise((resolve) => { setTimeout(resolve, 0) })

function createFakeBgmMedia() {
  return {
    volume: 0.6,
    muted: false,
    playCallCount: 0,
    pauseCallCount: 0,
    play() {
      this.playCallCount += 1
      return Promise.resolve()
    },
    pause() {
      this.pauseCallCount += 1
    },
  }
}

const { __setSfxPlayerForTests } = await import("../../../../src/shared/hooks/useSfxRuntime.js")
const { createSfxPlayer } = await import("../../../../src/shared/audio/sfxPlayer.js")
const { SFX_MANIFEST } = await import("../../../../src/shared/audio/sfxManifest.js")

const NIGHT_SUCCESS_VIDEO = SFX_MANIFEST["night-success-video"].embeddedVideos

const sfxDispatches = []
const sfxClaims = []
const sfxMediaCreations = []

const productionSfxPlayer = createSfxPlayer({
  manifest: SFX_MANIFEST,
  getSettings: () => ({ masterVolume: 100, sfxVolume: 100, sfxMuted: false }),
  getScope: () => ({
    accountId: useAuthStore.getState().user?.uuid ?? null,
    gameId: useInGameStore.getState().gameId ?? null,
    roomId: null,
  }),
  createMedia: (src) => {
    sfxMediaCreations.push(src)
    return {
      play: () => Promise.resolve(),
      pause() {},
      addEventListener() {},
      removeEventListener() {},
    }
  },
})

function installSharedProductionSfxPlayer() {
  __setSfxPlayerForTests({
    dispatch: (event) => { sfxDispatches.push(event); return productionSfxPlayer.dispatch(event) },
    claimAudio: (event, options) => { sfxClaims.push(event); return productionSfxPlayer.claimAudio(event, options) },
    getMix: () => productionSfxPlayer.getMix(),
    subscribeMix: (listener) => productionSfxPlayer.subscribeMix(listener),
    getSilenceLog: () => productionSfxPlayer.getSilenceLog(),
    syncScope: () => productionSfxPlayer.syncScope(),
    dispose: () => productionSfxPlayer.dispose(),
  })
}

installSharedProductionSfxPlayer()

function createFrontSocket({ id = "front-1", connected = true, forwardEmitTo = null } = {}) {
  const listeners = new Map()
  const emitted = []
  const ackCalls = []
  return {
    id,
    connected,
    forwardEmitTo,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    subscribedEvents() {
      return [...listeners.keys()].sort()
    },
    emit(event, payload, callback) {
      const entry = { event, payload, callback }
      emitted.push(entry)
      if (!this.forwardEmitTo) {
        if (typeof callback === "function") callback({ ok: true, duplicate: false })
        return
      }
      this.forwardEmitTo.trigger(event, payload, (response) => {
        entry.response = response
        if (typeof callback === "function") callback(response)
      })
    },
    emitted,
    emitsFor(event) {
      return emitted.filter((entry) => entry.event === event)
    },
    timeout() { return this },
    emitWithAck(event, payload) {
      const entry = { event, payload }
      ackCalls.push(entry)
      return new Promise((resolve) => {
        if (!this.forwardEmitTo) return
        this.forwardEmitTo.trigger(event, payload, (response) => {
          entry.response = response
          resolve(response)
        })
      })
    },
    ackCalls,
    ackCallsFor(event) {
      return ackCalls.filter((entry) => entry.event === event)
    },
  }
}

function makeBackendPlayer(uuid) {
  return { uuid, nickname: `nick-${uuid}`, isReady: true }
}

function createConventionFollowingRegistry() {
  const overrides = new Map()
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      if (prop === "get") return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
      return Reflect.get(target, prop, receiver)
    },
  })
}

function setupBackendNight(roomId, { playerCount = 10 } = {}) {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test"
  const REPO_ROOT = new URL("../../../../../", import.meta.url)
  const backendRequire = createRequire(new URL("backend/socket/matchmaking.js", REPO_ROOT))
  const gameSessionSocketLayer = backendRequire("./gameSession")
  const gameSessionCore = backendRequire("../game-core/gameSession")
  const matchmaking = backendRequire("./matchmaking")
  const gameResultRepository = backendRequire("../repositories/game/result")
  const {
    createFakeSocket: createBackendFakeSocket, createFakeIo,
  } = backendRequire("../tests/helpers/matchmakingFixtures")

  gameSessionCore.__resetStateForTests()
  matchmaking.__resetStateForTests()
  gameSessionSocketLayer.__resetStateForTests()
  gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())

  gameResultRepository.persistGameResultRecord = async () => ({ persisted: true })
  gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests(async () => {})

  const players = Array.from({ length: playerCount }, (_, i) => makeBackendPlayer(`fp-${roomId}-${i}`))
  const room = { id: roomId, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount: 1 } }
  const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.999 })
  gameSessionCore.commitGameSession(candidate.session)
  delete candidate.session.roleComposition
  const session = candidate.session
  for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
  session.phase = "NIGHT"
  session.dayIndex = 2
  session.nightActions = new Map()
  session.nightResolution = null
  session.dayVotes = new Map()
  session.dayVoteResolution = null
  session.tribunal = null

  const roleOf = (role) => [...session.players.values()].find((p) => p.role === role)?.uuid ?? null
  const jokerUuid = roleOf("JOKER")
  const doctorUuid = roleOf("DOCTOR")
  const citizenUuid = roleOf("CITIZEN")

  const io = createFakeIo([])
  const backendSockets = new Map()
  for (const uuid of session.players.keys()) {
    const backendSocket = createBackendFakeSocket(uuid)
    backendSocket.rooms.add(session.channelId)
    backendSocket.data.activeGameId = session.id
    io.sockets.sockets.set(backendSocket.id, backendSocket)
    gameSessionSocketLayer.registerGameHandlers(io, backendSocket, uuid)
    backendSockets.set(uuid, backendSocket)
  }

  let now = 1_000_000
  let nextTimerId = 1
  const timers = new Map()
  const clock = {
    nowFn: () => now,
    setTimeoutFn(fn, delayMs) {
      const id = nextTimerId++
      timers.set(id, { at: now + Math.max(0, delayMs), fn })
      return id
    },
    clearTimeoutFn(id) { timers.delete(id) },
  }
  const advance = (ms) => {
    const target = now + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = due[1].at
      due[1].fn()
    }
    now = target
  }

  gameSessionSocketLayer.__testables.startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

  const ctx = {
    gameSessionSocketLayer,
    gameSessionCore,
    io,
    session,
    backendSockets,
    jokerUuid,
    doctorUuid,
    citizenUuid,
    createBackendFakeSocket,
    advance,
    submit(uuid, targetId) {
      let response = null
      backendSockets.get(uuid).trigger(
        "submit_night_action", { gameId: session.id, targetId }, (res) => { response = res },
      )
      return response
    },
    ack(uuid, payload, outcome = null) {
      let response = null
      backendSockets.get(uuid).trigger(
        "acknowledge_night_action_success",
        {
          gameId: session.id,
          nightDayIndex: payload.nightDayIndex,
          eventId: payload.eventId,
          ...(outcome ? { outcome } : {}),
        },
        (res) => { response = res },
      )
      return response
    },
    reconnect(uuid, { joinChannel = true } = {}) {
      const next = createBackendFakeSocket(uuid)
      if (joinChannel) next.rooms.add(session.channelId)
      next.data.activeGameId = session.id
      io.sockets.sockets.set(next.id, next)
      gameSessionSocketLayer.registerGameHandlers(io, next, uuid)
      backendSockets.set(uuid, next)
      return next
    },
    receivedBy(uuid, event) {
      return backendSockets.get(uuid).received.filter((entry) => entry.event === event)
    },
    disconnect(uuid) {
      const socket = backendSockets.get(uuid)
      socket.connected = false
      io.sockets.sockets.delete(socket.id)
    },
  }
  return ctx
}

function setupBackendLastNight(roomId) {
  const ctx = setupBackendNight(roomId, { playerCount: 3 })
  const nonJokerUuids = [...ctx.session.players.values()]
    .filter((player) => player.role !== "JOKER")
    .map((player) => player.uuid)
  assert.equal(nonJokerUuids.length, 2, "전제: 마지막 밤 구성은 광대 1 + 비-광대 2다")
  return { ...ctx, targetUuid: nonJokerUuids[0], bystanderUuid: nonJokerUuids[1] }
}

function pickOutsider(ctx) {
  return [...ctx.session.players.keys()]
    .find((uuid) => uuid !== ctx.jokerUuid && uuid !== ctx.citizenUuid && uuid !== ctx.doctorUuid)
}

function backendRosterForStore(ctx) {
  return [...ctx.session.players.entries()].map(([uuid, player]) => ({
    uuid,
    nickname: `nick-${uuid}`,
    alive: player.isAlive !== false,
    membershipId: player.membershipId ?? null,
  }))
}

function seedFrontSession(ctx, uuid) {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid, nickname: `nick-${uuid}` }, identityGeneration: 0 })
    useInGameStore.setState({
      gameId: null, state: null, hostUuid: null, error: null, snapshotSeq: 0,
      nightPrivateResult: null, nightPresentationWait: null,
    })
    const player = ctx.session.players.get(uuid)
    useInGameStore.getState().setGamePayload({
      gameId: ctx.session.id,
      state: {
        id: ctx.session.id,
        phase: "NIGHT",
        dayIndex: ctx.session.dayIndex,
        dayPhase: null,
        players: backendRosterForStore(ctx),
        self: {
          uuid,
          nickname: `nick-${uuid}`,
          role: player.role,
          team: player.team ?? "CITIZEN",
          hasActedThisPhase: false,
        },
      },
    })
  })
}

function seedEmptyFrontStore(uuid) {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid, nickname: `nick-${uuid}` }, identityGeneration: 0 })
    useInGameStore.setState({
      gameId: null, state: null, hostUuid: null, error: null, snapshotSeq: 0,
      nightPrivateResult: null, nightPresentationWait: null,
    })
  })
}

function routerWrapper({ children }) {
  return React.createElement(MemoryRouter, null, children)
}

function openHookSession({ socketOptions } = {}) {
  const socket = createFrontSocket(socketOptions)
  act(() => setSocket(socket))
  const rendered = renderHook(() => {
    useGameSessionSocketEvents()
    useInGameSessionSnapshotSync()
    const queue = useInGameStore(selectNightSuccessQueue)
    const presentation = useInGameNightSuccessPresentation()
    return { queue, presentation }
  }, { wrapper: routerWrapper })
  return {
    socket,
    get value() { return rendered.result.current },
    deliver(event, payload) { act(() => socket.deliver(event, payload)) },
    async settle() { await act(async () => { await flushMicrotasks() }) },
    close() {
      rendered.unmount()
      act(() => setSocket(null))
    },
  }
}

function findRetrySurface(container) {
  return container?.querySelector(`[${INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR}]`) ?? null
}

function findButton(container, label) {
  return [...container.querySelectorAll("button")].find((node) => node.textContent.trim() === label) ?? null
}

async function dismissParchmentOverlays(container) {
  for (let i = 0; i < 5; i += 1) {
    const confirmButton = findButton(container, "확인")
    if (!confirmButton) return
    await act(async () => { confirmButton.click() })
  }
}

async function mountInGamePage(socket) {
  currentSocket = socket
  for (const cb of [...socketSubscribers]) cb()
  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router })) })
  await act(async () => { await router.navigate("/ingame") })
  await dismissParchmentOverlays(view.container)
  return view
}

async function leaveInGamePage() {
  await act(async () => { await router.navigate("/lobby") })
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
}

function createProductionInGameScreen(Page) {
  return function ProductionInGameScreen() {
    useGameSessionSocketEvents()
    return React.createElement(Page)
  }
}

async function mountInGamePageDirect(socket, Page, { dismissOverlays = true } = {}) {
  currentSocket = socket
  for (const cb of [...socketSubscribers]) cb()
  const directRouter = createMemoryRouter(
    [
      { path: "/ingame", element: React.createElement(createProductionInGameScreen(Page)) },
      { path: "/gameresult", element: React.createElement("div", { "data-test-game-result": "true" }) },
    ],
    { initialEntries: ["/ingame"] },
  )
  const navigations = []
  directRouter.subscribe((state) => navigations.push(state.location.pathname))
  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router: directRouter })) })
  if (dismissOverlays) await dismissParchmentOverlays(view.container)
  view.directRouter = directRouter
  view.navigations = navigations
  return view
}

function privateKillVideo(view) {
  return view.container.querySelector("[data-ingame-night-success-kill] video")
}

function findRoleRevealDialog(container) {
  return container.querySelector('[role="dialog"][aria-label="내 역할 보기"]')
}

function captureVideoWatchdogTimers() {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const pending = new Map()
  let nextId = 1
  globalThis.setTimeout = (fn, delay, ...rest) => {
    if (delay === INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS) {
      const id = { watchdog: nextId++ }
      pending.set(id, fn)
      return id
    }
    return originalSetTimeout(fn, delay, ...rest)
  }
  globalThis.clearTimeout = (id) => {
    if (pending.has(id)) {
      pending.delete(id)
      return undefined
    }
    return originalClearTimeout(id)
  }
  return {
    pendingCount: () => pending.size,
    fire() {
      const due = [...pending.values()]
      pending.clear()
      for (const fn of due) fn()
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    },
  }
}

function captureServerScheduledTimers(run) {
  const originalSetTimeout = globalThis.setTimeout
  const calls = []
  let fakeTimerId = 1
  globalThis.setTimeout = (fn, delay) => {
    calls.push({ fn, delay })
    return fakeTimerId++
  }
  try {
    run()
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
  return calls
}

function driveRemainingNightRolesToFinalization(ctx) {
  return captureServerScheduledTimers(() => {
    for (let guard = 0; guard < 12 && ctx.session.phase === "NIGHT"; guard += 1) {
      const role = ctx.session.nightTurnRole
      if (!role) {
        ctx.advance(30_000)
        continue
      }
      const actor = [...ctx.session.players.entries()]
        .find(([, player]) => player.role === role && player.isAlive !== false)
      if (!actor) {
        ctx.advance(30_000)
        continue
      }
      ctx.submit(actor[0], null)
    }
  })
}

function resetScreenBetweenScenes() {
  cleanup()
  useInGameStore.getState().clearGame()
  currentSocket = null
  for (const cb of [...socketSubscribers]) cb()
}

test.afterEach(async () => {
  cleanup()
  useInGameStore.getState().clearGame()
  currentSocket = null
  for (const cb of [...socketSubscribers]) cb()
})

test("AC-01/AC-02/AC-05: 실제 KILL이 대기를 열면 비수신자 화면에는 대기 문구만 뜨고, 두 수신자가 모두 완료해야 풀린다", async () => {
  const ctx = setupBackendNight("f27bl-wait-live")
  const outsiderUuid = pickOutsider(ctx)

  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.jokerUuid, "night_action_success")[0]?.payload
  assert.ok(killPayload, "전제: 광대가 KILL 성공 사건을 받아야 한다")

  const waitNotices = ctx.receivedBy(outsiderUuid, "night_presentation_wait")
  assert.equal(waitNotices.length, 1, "비수신자는 대기 시작 알림을 정확히 한 번 받아야 한다")
  assert.deepEqual(Object.keys(waitNotices[0].payload).sort(), ["gameId", "nightDayIndex", "waiting"])
  assert.deepEqual(waitNotices[0].payload,
    { gameId: ctx.session.id, nightDayIndex: ctx.session.dayIndex, waiting: true })
  assert.equal(ctx.receivedBy(ctx.jokerUuid, "night_presentation_wait").length, 0, "수신자에게 대기 알림이 갔다")
  assert.equal(ctx.receivedBy(ctx.citizenUuid, "night_presentation_wait").length, 0, "대상자에게 대기 알림이 갔다")

  seedFrontSession(ctx, outsiderUuid)
  const socket = createFrontSocket()
  const view = await mountInGamePage(socket)
  const sfxBefore = sfxDispatches.length
  const claimsBefore = sfxClaims.length

  await act(async () => { socket.deliver("night_presentation_wait", waitNotices[0].payload) })

  const waitPanel = view.container.querySelector("[data-ingame-night-presentation-wait]")
  assert.notEqual(waitPanel, null, "비수신자 화면에 대기 화면이 뜨지 않았다")
  assert.equal(view.container.textContent.includes(INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE), true)

  const markup = view.container.innerHTML
  for (const secret of [killPayload.eventId, ctx.citizenUuid, ctx.jokerUuid, "JOKER", "KILL"]) {
    assert.equal(markup.includes(secret), false, `대기 화면에 ${secret}이(가) 노출됐다`)
  }
  assert.equal(view.container.querySelector("video[src]"), null, "비수신자 화면에 연출 영상이 떴다")
  assert.equal(useInGameStore.getState().nightSuccessQueue.length, 0, "비수신자 화면에 성공 큐가 생겼다")
  assert.equal(socket.emitsFor("acknowledge_night_action_success").length, 0, "비수신자가 완료 보고를 보냈다")
  assert.equal(sfxDispatches.length, sfxBefore, "대기 시작이 새 효과음을 만들었다")
  assert.equal(sfxClaims.length, claimsBefore, "대기 시작이 영상 내장음 소유권을 선점했다")

  const lockedSurface = [...view.container.querySelectorAll("div[inert]")]
  assert.ok(lockedSurface.length > 0, "대기 중에도 게임 본문이 잠기지 않았다")

  assert.deepEqual(ctx.ack(ctx.jokerUuid, killPayload), { ok: true, duplicate: false })
  assert.equal(ctx.receivedBy(outsiderUuid, "night_presentation_wait").length, 1,
    "한 명만 완료했는데 해제 알림이 나갔다")
  assert.notEqual(view.container.querySelector("[data-ingame-night-presentation-wait]"), null,
    "한 명만 완료했는데 대기 화면이 사라졌다")

  assert.deepEqual(ctx.ack(ctx.citizenUuid, killPayload), { ok: true, duplicate: false })
  const release = ctx.receivedBy(outsiderUuid, "night_presentation_wait")
  assert.equal(release.length, 2, "두 수신자가 모두 완료했는데 해제 알림이 없다")
  assert.deepEqual(release[1].payload,
    { gameId: ctx.session.id, nightDayIndex: ctx.session.dayIndex, waiting: false })
  assert.equal(ctx.session.nightTurnRole, "DOCTOR", "해제 뒤 다음 역할 턴이 시작되지 않았다")

  await act(async () => { socket.deliver("night_presentation_wait", release[1].payload) })
  assert.equal(view.container.querySelector("[data-ingame-night-presentation-wait]"), null,
    "해제 알림 뒤에도 대기 화면이 남아 있다")
  assert.equal(useInGameStore.getState().nightPresentationWait, null)
  assert.equal(sfxDispatches.length, sfxBefore, "대기 해제가 새 효과음을 만들었다")

  await leaveInGamePage()
})

test("AC-01(CODEX 반려 수정): 역할 공개가 떠 있어도 대기 알림이 오면 대기 화면이 그 위를 덮고, 역할 비밀 정보는 DOM에서 사라진다", async () => {
  const ctx = setupBackendNight("f27bl-wait-over-role-reveal")
  const outsiderUuid = pickOutsider(ctx)
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const waitPayload = ctx.receivedBy(outsiderUuid, "night_presentation_wait")[0].payload

  seedFrontSession(ctx, outsiderUuid)
  const socket = createFrontSocket()
  const view = await mountInGamePageDirect(socket, InGamePage, { dismissOverlays: false })

  const roleInfo = getInGameRoleRevealInfo(useInGameStore.getState().state.self, { authUuid: outsiderUuid })
  assert.ok(roleInfo, "전제: 역할 공개가 그릴 정보가 있어야 한다")
  assert.notEqual(findRoleRevealDialog(view.container), null, "전제: 역할 공개가 떠 있어야 한다")
  assert.equal(view.container.innerHTML.includes(roleInfo.roleName), true,
    "전제: 역할 공개가 역할명을 그리고 있어야 한다")

  await act(async () => { socket.deliver("night_presentation_wait", waitPayload) })

  assert.notEqual(view.container.querySelector("[data-ingame-night-presentation-wait]"), null,
    "역할 공개가 떠 있다고 유효한 대기 화면이 숨겨졌다")
  assert.equal(findRoleRevealDialog(view.container), null, "대기 중인데 역할 공개 창이 남아 있다")
  assert.equal(view.container.innerHTML.includes(roleInfo.roleName), false,
    "대기 중 화면에 역할명이 남아 있다")
  assert.equal(view.container.innerHTML.includes(roleInfo.teamLabel), false,
    "대기 중 화면에 진영 표시가 남아 있다")

  await act(async () => {
    socket.deliver("night_presentation_wait", { ...waitPayload, waiting: false })
  })
  assert.equal(view.container.querySelector("[data-ingame-night-presentation-wait]"), null,
    "해제 뒤에도 대기 화면이 남았다")
  assert.notEqual(findRoleRevealDialog(view.container), null,
    "대기가 풀렸는데 역할 공개가 돌아오지 않았다")

  resetScreenBetweenScenes()
})

test("AC-01/AC-03/AC-05: 대기 중 새로고침은 실제 조회로 대기를 복원하고, 그 새 연결도 해제 통지를 받는다", async () => {
  const ctx = setupBackendNight("f27bl-wait-refresh")
  const outsiderUuid = pickOutsider(ctx)
  ctx.disconnect(outsiderUuid)
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.jokerUuid, "night_action_success")[0].payload
  assert.equal(ctx.receivedBy(outsiderUuid, "night_presentation_wait").length, 0,
    "전제: 끊겨 있던 비수신자는 시작 알림을 받지 못한다")

  const reconnected = ctx.reconnect(outsiderUuid)
  seedEmptyFrontStore(outsiderUuid)

  const session = openHookSession({ socketOptions: { forwardEmitTo: reconnected } })
  await session.settle()

  const ack = session.socket.ackCallsFor("get_session_snapshot")[0]
  assert.ok(ack, "훅이 실제 조회를 보내지 않았다")
  assert.equal(ack.response.ok, true, `조회가 실패했다: ${JSON.stringify(ack.response)}`)
  assert.equal(ack.response.presentationWaiting, true, "비수신자의 조회가 대기를 알려주지 않았다")
  assert.deepEqual(ack.response.nightSuccessRecovery, [], "비수신자 응답에 남의 성공 사건이 실렸다")
  const leaked = JSON.stringify(ack.response)
  assert.equal(leaked.includes(killPayload.eventId), false, "조회 응답에 사건 ID가 실렸다")
  assert.equal(leaked.includes("contract"), false, "조회 응답에 내부 계약이 실렸다")

  const restored = useInGameStore.getState().nightPresentationWait
  assert.notEqual(restored, null, "조회 응답이 대기를 복원하지 않았다")
  assert.equal(restored.gameId, ctx.session.id)
  assert.equal(restored.nightDayIndex, ctx.session.dayIndex)
  assert.equal(useInGameStore.getState().nightSuccessQueue.length, 0)
  assert.equal(session.socket.emitsFor("acknowledge_night_action_success").length, 0)

  assert.equal(ctx.session.nightTurnRole, null, "조회가 다음 역할 턴을 시작시켰다")

  ctx.ack(ctx.jokerUuid, killPayload)
  ctx.ack(ctx.citizenUuid, killPayload)
  const release = reconnected.received.filter((e) => e.event === "night_presentation_wait")
  assert.equal(release.length, 1, "새 연결이 해제 통지를 받지 못했다")
  assert.equal(release[0].payload.waiting, false)

  session.deliver("night_presentation_wait", release[0].payload)
  assert.equal(useInGameStore.getState().nightPresentationWait, null)

  session.close()
})

test("AC-01: 사건 수신자는 재접속해도 대기로 분류되지 않고, 자기 미완료 사건만 복원받는다", async () => {
  const ctx = setupBackendNight("f27bl-recipient-refresh")
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[0].payload

  const reconnected = ctx.reconnect(ctx.citizenUuid)
  seedEmptyFrontStore(ctx.citizenUuid)

  const session = openHookSession({ socketOptions: { forwardEmitTo: reconnected } })
  await session.settle()

  const ack = session.socket.ackCallsFor("get_session_snapshot")[0]
  assert.equal(ack.response.ok, true, `조회가 실패했다: ${JSON.stringify(ack.response)}`)
  assert.equal(ack.response.presentationWaiting, false,
    "원래 수신자가 재접속 뒤 비수신자 대기로 분류됐다")
  assert.deepEqual(ack.response.nightSuccessRecovery, [killPayload],
    "수신자의 미완료 사건이 복원되지 않았다")
  assert.equal(useInGameStore.getState().nightPresentationWait, null)
  assert.deepEqual(session.value.queue.map((e) => e.eventId), [killPayload.eventId])

  session.close()
})

test("AC-03/AC-05: 재접속으로 같은 사건이 복원되면 옛 표시의 늦은 완료는 새 표시를 건드리지 못한다", async () => {
  const ctx = setupBackendNight("f27bl-stale-finish")
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(ctx, ctx.citizenUuid)
  const first = openHookSession({ socketOptions: { forwardEmitTo: ctx.backendSockets.get(ctx.citizenUuid) } })
  first.deliver("night_action_success", killPayload)
  assert.equal(first.value.presentation.current?.eventId, killPayload.eventId)
  const staleFinish = first.value.presentation.finish
  first.close()

  assert.equal(useInGameStore.getState().nightSuccessQueue.length, 0,
    "연결이 끊겼는데 이전 연결의 사건이 큐에 남았다")

  const reconnected = ctx.reconnect(ctx.citizenUuid)
  seedEmptyFrontStore(ctx.citizenUuid)
  const second = openHookSession({
    socketOptions: { id: "front-2", forwardEmitTo: reconnected },
  })
  await second.settle()
  assert.deepEqual(second.value.queue.map((e) => e.eventId), [killPayload.eventId],
    "실제 조회가 미완료 사건을 복원하지 않았다")

  act(() => staleFinish("COMPLETED"))
  assert.deepEqual(second.value.queue.map((e) => e.eventId), [killPayload.eventId],
    "옛 콜백이 새 표시의 큐를 지웠다")
  assert.equal(second.socket.emitsFor("acknowledge_night_action_success").length, 0,
    "옛 콜백이 완료 보고를 보냈다")
  const stored = ctx.gameSessionSocketLayer.__testables
    .__getNightSuccessReceiptsForTests(ctx.session)
  assert.equal(stored.byEvent.get(killPayload.eventId).get(ctx.citizenUuid).completed, false,
    "옛 콜백이 서버 기록을 완료로 바꿨다")

  act(() => second.value.presentation.finish("COMPLETED"))
  const acks = second.socket.emitsFor("acknowledge_night_action_success")
  assert.equal(acks.length, 1, "새 표시의 완료가 정확히 한 번 보고되지 않았다")
  assert.deepEqual(acks[0].response, { ok: true, duplicate: false })
  assert.equal(stored.byEvent.get(killPayload.eventId).get(ctx.citizenUuid).completed, true)
  assert.deepEqual(second.value.queue, [])

  act(() => second.value.presentation.finish("COMPLETED"))
  assert.equal(second.socket.emitsFor("acknowledge_night_action_success").length, 1)

  second.close()
})

test("AC-03/AC-04/AC-05: 실제 페이지에서 KILL 영상이 끝나면 서버 완료 기록이 바뀌고, 나머지 수신자까지 끝나야 다음 역할이 시작된다 — 그동안 별도 SFX·매체 생성은 0회다", async () => {
  const ctx = setupBackendNight("f27bl-page-video")
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(ctx, ctx.citizenUuid)
  const socket = createFrontSocket({ forwardEmitTo: ctx.backendSockets.get(ctx.citizenUuid) })
  const view = await mountInGamePage(socket)
  const sfxBefore = sfxDispatches.length
  const claimsBefore = sfxClaims.length
  const mediaBefore = sfxMediaCreations.length

  const bgmMedia = createFakeBgmMedia()
  const bgmHook = renderHook(() => useBgmAutoplay({ current: bgmMedia }))
  const bgmPlayBaseline = bgmMedia.playCallCount

  await act(async () => { socket.deliver("night_action_success", killPayload) })
  const video = view.container.querySelector("video[src]")
  assert.notEqual(video, null, "실제 페이지가 KILL 영상을 마운트하지 않았다")
  assert.equal(video.getAttribute("src"), NIGHT_SUCCESS_VIDEO["KILL-TARGET"])
  await act(async () => { await flushMicrotasks() })
  assert.equal(video.muted, false, "Master×SFX가 모두 100인데 영상이 음소거다")
  assert.ok(Math.abs(video.volume - 1) < 1e-9, `volume이 Master×SFX(1.0)와 다르다: ${video.volume}`)
  assert.equal(sfxDispatches.length, sfxBefore, "역할 영상 표시가 별도 SFX dispatch를 만들었다")
  assert.equal(sfxClaims.length, claimsBefore, "역할 영상 표시가 claimAudio를 호출했다")
  assert.equal(sfxMediaCreations.length, mediaBefore, "역할 영상 표시가 별도 매체를 생성했다")
  assert.equal(bgmMedia.playCallCount, bgmPlayBaseline, "역할 영상 표시가 BGM play()를 호출했다")

  await act(async () => { fireEvent(video, new dom.window.Event("ended")) })
  const acks = socket.emitsFor("acknowledge_night_action_success")
  assert.equal(acks.length, 1)
  assert.equal(sfxDispatches.length, sfxBefore, "역할 영상 종료가 별도 SFX dispatch를 만들었다")
  assert.equal(sfxClaims.length, claimsBefore, "역할 영상 종료가 claimAudio를 호출했다")
  assert.equal(sfxMediaCreations.length, mediaBefore, "역할 영상 종료가 별도 매체를 생성했다")
  assert.equal(bgmMedia.playCallCount, bgmPlayBaseline, "역할 영상 종료가 BGM play()를 호출했다")
  assert.deepEqual(acks[0].payload,
    { gameId: ctx.session.id, nightDayIndex: killPayload.nightDayIndex, eventId: killPayload.eventId })
  assert.deepEqual(acks[0].response, { ok: true, duplicate: false })

  assert.equal(ctx.session.nightTurnRole, null, "한 수신자의 완료만으로 다음 역할이 시작됐다")

  ctx.ack(ctx.jokerUuid, killPayload)
  assert.equal(ctx.session.nightTurnRole, "DOCTOR", "두 수신자가 모두 완료했는데 다음 역할이 없다")
  assert.equal(bgmMedia.playCallCount, bgmPlayBaseline, "나머지 수신자 완료까지의 진행이 BGM play()를 호출했다")

  bgmHook.unmount()
  await leaveInGamePage()
})

test("AC-03: 실제 settingsStore의 Master×SFX·음소거 값이 실제 sfxPlayer 계산을 거쳐 video에 반영된다(100×100 고정이 아닌 값)", async () => {
  const ctx = setupBackendNight("f27bl-real-settings-mix")
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(ctx, ctx.citizenUuid)

  const previousVolumes = { ...useSettingsStore.getState().volumes }
  const previousSfxMuted = useSettingsStore.getState().sfxMuted
  useSettingsStore.setState({
    volumes: { ...previousVolumes, "master-volume": 50, "sfx-volume": 40 },
    sfxMuted: false,
  })

  const realSettingsSfxPlayer = createSfxPlayer({
    manifest: SFX_MANIFEST,
    getSettings: () => {
      const s = useSettingsStore.getState()
      return {
        masterVolume: s.volumes["master-volume"],
        sfxVolume: s.volumes["sfx-volume"],
        sfxMuted: s.sfxMuted === true,
      }
    },
    subscribeSettings: (listener) => useSettingsStore.subscribe(listener),
    getScope: () => ({
      accountId: useAuthStore.getState().user?.uuid ?? null,
      gameId: useInGameStore.getState().gameId ?? null,
      roomId: null,
    }),
    createMedia: () => ({ play: () => Promise.resolve(), pause() {}, addEventListener() {}, removeEventListener() {} }),
  })
  __setSfxPlayerForTests({
    dispatch: (event) => realSettingsSfxPlayer.dispatch(event),
    claimAudio: (event, options) => realSettingsSfxPlayer.claimAudio(event, options),
    getMix: () => realSettingsSfxPlayer.getMix(),
    subscribeMix: (listener) => realSettingsSfxPlayer.subscribeMix(listener),
    getSilenceLog: () => realSettingsSfxPlayer.getSilenceLog(),
    syncScope: () => realSettingsSfxPlayer.syncScope(),
    dispose: () => realSettingsSfxPlayer.dispose(),
  })

  try {
    const socket = createFrontSocket({ forwardEmitTo: ctx.backendSockets.get(ctx.citizenUuid) })
    const view = await mountInGamePage(socket)
    await act(async () => { socket.deliver("night_action_success", killPayload) })
    const video = view.container.querySelector("video[src]")
    assert.notEqual(video, null, "실제 페이지가 KILL 영상을 마운트하지 않았다")
    await act(async () => { await flushMicrotasks() })
    assert.equal(video.muted, false)
    assert.ok(Math.abs(video.volume - 0.2) < 1e-9, `실제 settingsStore Master50×SFX40=0.2가 아니다: ${video.volume}`)

    act(() => { useSettingsStore.setState({ sfxMuted: true }) })
    assert.equal(video.muted, true, "실제 settingsStore의 음소거가 video에 반영되지 않았다")

    await leaveInGamePage()
  } finally {
    installSharedProductionSfxPlayer()
    realSettingsSfxPlayer.dispose()
    useSettingsStore.setState({ volumes: previousVolumes, sfxMuted: previousSfxMuted })
  }
})

test("AC-03(CODEX 반려 수정): 재시도 뒤에도 매체가 무응답이면 상한이 다시 걸려 ERROR가 실제 서버에 정확히 한 번 보고된다", async () => {
  const ctx = setupBackendNight("f27bl-retry-watchdog")
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(ctx, ctx.citizenUuid)
  const socket = createFrontSocket({ forwardEmitTo: ctx.backendSockets.get(ctx.citizenUuid) })
  const clock = captureVideoWatchdogTimers()
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  try {
    dom.window.HTMLMediaElement.prototype.play = function blockedPlay() {
      const err = new Error("NotAllowedError")
      err.name = "NotAllowedError"
      return Promise.reject(err)
    }
    const view = await mountInGamePageDirect(socket, InGamePage)
    await act(async () => { socket.deliver("night_action_success", killPayload) })
    await act(async () => { await flushMicrotasks() })

    const killPanel = () => view.container.querySelector("[data-ingame-night-success-kill]")
    assert.notEqual(findRetrySurface(killPanel()), null,
      "전제: 자동재생 차단이면 재시도 화면이 뜬다")
    assert.equal(clock.pendingCount(), 0, "응답이 온 시도의 상한이 그대로 남아 있다")

    dom.window.HTMLMediaElement.prototype.play = function silentPlay() {
      return new Promise(() => {})
    }
    await act(async () => { findRetrySurface(killPanel()).click() })
    await act(async () => { await flushMicrotasks() })
    assert.equal(clock.pendingCount(), 1, "재시도가 상한을 다시 예약하지 않았다(무응답이면 영영 멈춘다)")
    assert.equal(socket.emitsFor("acknowledge_night_action_success").length, 0,
      "아직 아무 응답도 없는데 완료를 보고했다")

    await act(async () => { clock.fire() })
    await act(async () => { await flushMicrotasks() })
    const acks = socket.emitsFor("acknowledge_night_action_success")
    assert.equal(acks.length, 1, "재시도 무응답이 상한 뒤에도 보고되지 않았다")
    assert.equal(acks[0].payload.outcome, "ERROR", "재시도 무응답이 ERROR로 보고되지 않았다")
    assert.deepEqual(acks[0].response, { ok: true, duplicate: false })
    const stored = ctx.gameSessionSocketLayer.__testables
      .__getNightSuccessReceiptsForTests(ctx.session)
    assert.equal(stored.byEvent.get(killPayload.eventId).get(ctx.citizenUuid).completed, true,
      "ERROR 보고가 서버 완료 기록을 남기지 않았다")

    assert.equal(killPanel(), null, "ERROR로 끝난 연출이 화면에 남았다")
    assert.deepEqual(useInGameStore.getState().nightSuccessQueue, [])
    assert.equal(clock.pendingCount(), 0, "끝난 연출의 상한이 남아 있다")

    assert.equal(ctx.session.nightTurnRole, null, "한 수신자의 ERROR만으로 다음 역할이 시작됐다")
    ctx.ack(ctx.jokerUuid, killPayload, "SKIPPED")
    assert.equal(ctx.session.nightTurnRole, "DOCTOR", "두 수신자가 모두 끝났는데 다음 역할이 없다")
  } finally {
    dom.window.HTMLMediaElement.prototype.play = originalPlay
    clock.restore()
  }
  resetScreenBetweenScenes()
})

test("AC-03/AC-05: 미응답 상한은 대기를 정확히 한 번 해제하고, 그 뒤의 늦은 최초 완료는 진행을 되돌리지 않는다", () => {
  const ctx = setupBackendNight("f27bl-timeout")
  const outsiderUuid = pickOutsider(ctx)
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.jokerUuid, "night_action_success")[0].payload
  assert.equal(ctx.session.nightTurnRole, null, "전제: 대기 중에는 다음 역할이 시작되지 않는다")

  ctx.advance(12_000)
  const notices = ctx.receivedBy(outsiderUuid, "night_presentation_wait")
  assert.equal(notices.length, 2, "상한 해제 통지가 정확히 한 번이 아니다")
  assert.equal(notices[1].payload.waiting, false)
  assert.equal(ctx.session.nightTurnRole, "DOCTOR", "상한 뒤 다음 역할이 시작되지 않았다")

  const roleBefore = ctx.session.nightTurnRole
  assert.deepEqual(ctx.ack(ctx.citizenUuid, killPayload, "SKIPPED"), { ok: true, duplicate: false })
  assert.equal(ctx.session.nightTurnRole, roleBefore, "늦은 완료가 진행 중인 턴을 바꿨다")
  assert.equal(ctx.receivedBy(outsiderUuid, "night_presentation_wait").length, 2,
    "늦은 완료가 두 번째 해제 통지를 만들었다")
})

test("AC-04/AC-05: KILL·HEAL을 모두 완료한 대상자는 다음 낮에 같은 사건을 다시 받지 않는다(재전달·재조회 모두)", async () => {
  const ctx = setupBackendNight("f27bl-next-day")
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(ctx, ctx.citizenUuid)
  const session = openHookSession({ socketOptions: { forwardEmitTo: ctx.backendSockets.get(ctx.citizenUuid) } })

  session.deliver("night_action_success", killPayload)
  act(() => session.value.presentation.finish("COMPLETED"))
  ctx.ack(ctx.jokerUuid, killPayload)
  assert.equal(ctx.session.nightTurnRole, "DOCTOR", "전제: KILL 대기가 풀려 의사 턴이 시작돼야 한다")

  assert.deepEqual(ctx.submit(ctx.doctorUuid, ctx.citizenUuid), { ok: true })
  const healPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[1]?.payload
  assert.ok(healPayload, "전제: 대상자가 HEAL 성공 사건을 받아야 한다")
  assert.notEqual(healPayload.eventId, killPayload.eventId)

  session.deliver("night_action_success", healPayload)
  assert.equal(session.value.presentation.current?.eventId, healPayload.eventId)
  act(() => session.value.presentation.finish("COMPLETED"))
  ctx.ack(ctx.doctorUuid, healPayload)
  assert.deepEqual(session.value.queue, [], "두 연출을 모두 소비했는데 큐가 남았다")

  const nextDayIndex = ctx.session.dayIndex + 1
  session.deliver("night_result_applied", {
    gameId: ctx.session.id,
    phase: "DAY",
    dayIndex: nextDayIndex,
    players: backendRosterForStore(ctx).map((p) => ({ uuid: p.uuid, alive: true })),
    victimUuid: null,
    deathReveals: [],
  })
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.equal(useInGameStore.getState().state.dayIndex, nextDayIndex)

  session.deliver("night_action_success", killPayload)
  session.deliver("night_action_success", healPayload)
  assert.deepEqual(session.value.queue, [], "같은 밤의 사건이 다음 낮에 다시 큐로 들어왔다")
  assert.equal(session.value.presentation.current, null, "다음 낮에 개인 연출이 다시 시작됐다")

  ctx.session.phase = "DAY"
  ctx.session.dayIndex = nextDayIndex
  const reconnected = ctx.reconnect(ctx.citizenUuid)
  session.socket.forwardEmitTo = reconnected
  await act(async () => {
    session.socket.deliver("connect", undefined)
    await flushMicrotasks()
  })
  const ack = session.socket.ackCallsFor("get_session_snapshot").at(-1)
  assert.equal(ack.response.ok, true, `재조회가 실패했다: ${JSON.stringify(ack.response)}`)
  assert.deepEqual(ack.response.nightSuccessRecovery, [], "완료한 사건이 다음 낮 재조회로 다시 실렸다")
  assert.equal(ack.response.presentationWaiting, false, "낮인데 대기로 복원됐다")
  assert.deepEqual(useInGameStore.getState().nightSuccessQueue, [])

  session.close()
})

test("AC-03/AC-05: 마지막 밤의 종료가 연출 도중에 도착해도(실제 서버 최종화) 연출을 끝까지 보여준 뒤 결과 화면으로 한 번 이동한다", async () => {
  const ctx = setupBackendLastNight("f27bl-last-night")
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.targetUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.targetUuid, "night_action_success")[0].payload

  seedFrontSession(ctx, ctx.targetUuid)
  const socket = createFrontSocket({ forwardEmitTo: ctx.backendSockets.get(ctx.targetUuid) })
  const view = await mountInGamePage(socket)

  await act(async () => { socket.deliver("night_action_success", killPayload) })
  assert.notEqual(privateKillVideo(view), null, "연출 영상이 시작되지 않았다")

  ctx.advance(12_000)
  assert.equal(ctx.session.nightTurnRole, "DOCTOR", "전제: 상한 해제 뒤 다음 역할이 시작된다")
  const scheduledOnEnd = driveRemainingNightRolesToFinalization(ctx)
  assert.equal(ctx.session.phase, "ENDED", "실제 서버가 마지막 밤을 종료로 최종화하지 않았다")
  assert.deepEqual(ctx.session.winResult, { winner: "JOKER" })
  assert.equal(ctx.session.players.get(ctx.targetUuid).alive, false)
  assert.deepEqual(scheduledOnEnd, [], "경기가 끝났는데 다음 낮 타이머가 예약됐다")

  const applied = ctx.receivedBy(ctx.targetUuid, "night_result_applied")
  assert.equal(applied.length, 1, "서버 최종화가 결과 전달을 만들지 않았다")
  assert.equal(applied[0].payload.phase, "ENDED")
  assert.equal(applied[0].payload.winResult.winner, "JOKER")
  assert.ok(Array.isArray(applied[0].payload.winResult.reveals), "종료 payload의 공개 winResult에는 reveals가 실린다")

  await act(async () => { socket.deliver("night_result_applied", applied[0].payload) })
  assert.equal(useInGameStore.getState().state.phase, "ENDED", "전제: 종료가 반영돼야 한다")
  assert.equal(router.state.location.pathname, "/ingame",
    "개인 연출이 남았는데 결과 화면으로 넘어갔다")

  const video = privateKillVideo(view)
  assert.notEqual(video, null, "종료 도착이 개인 연출을 잘랐다")
  await act(async () => { fireEvent(video, new dom.window.Event("ended")) })
  await act(async () => { await flushMicrotasks() })
  assert.equal(router.state.location.pathname, "/gameresult", "연출이 끝났는데 결과 화면으로 가지 않았다")
  assert.equal(socket.emitsFor("acknowledge_night_action_success").length, 1,
    "마지막 밤의 완료 보고가 정확히 한 번이 아니다")

  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
  await act(async () => { await router.navigate("/lobby") })
})

test("AC-02: 대기 화면은 어떤 상호작용에도 소리를 만들지 않고 완료를 보고하지도 않는다", async () => {
  const ctx = setupBackendNight("f27bl-silence")
  const outsiderUuid = pickOutsider(ctx)
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const waitPayload = ctx.receivedBy(outsiderUuid, "night_presentation_wait")[0].payload

  seedFrontSession(ctx, outsiderUuid)
  const socket = createFrontSocket()
  const view = await mountInGamePage(socket)

  await act(async () => { socket.deliver("night_presentation_wait", waitPayload) })
  const panel = view.container.querySelector("[data-ingame-night-presentation-wait]")
  assert.notEqual(panel, null)

  const sfxBefore = sfxDispatches.length
  const claimsBefore = sfxClaims.length
  const emitsBefore = socket.emitted.length

  assert.deepEqual([...panel.querySelectorAll("button")], [], "대기 화면에 조작 버튼이 있다")
  await act(async () => { fireEvent.click(panel) })
  await act(async () => { fireEvent.keyDown(dom.window, { key: "Escape" }) })

  assert.equal(sfxDispatches.length, sfxBefore, "대기 화면 클릭·Escape가 소리를 만들었다")
  assert.equal(sfxClaims.length, claimsBefore, "대기 화면이 내장음 소유권을 선점했다")
  assert.equal(socket.emitted.length, emitsBefore, "대기 화면 조작이 서버 요청을 만들었다")
  assert.notEqual(view.container.querySelector("[data-ingame-night-presentation-wait]"), null,
    "대기 화면이 사용자 조작으로 닫혔다")

  await leaveInGamePage()
})

test("F27 BL production integration scenarios", async () => {
  const waitCtx = setupBackendNight("f27bl-prod-wait")
  const outsiderUuid = pickOutsider(waitCtx)
  assert.deepEqual(waitCtx.submit(waitCtx.jokerUuid, waitCtx.citizenUuid), { ok: true })
  const waitPayload = waitCtx.receivedBy(outsiderUuid, "night_presentation_wait")[0].payload

  seedFrontSession(waitCtx, outsiderUuid)
  const waitSocket = createFrontSocket()
  const waitView = await mountInGamePageDirect(waitSocket, InGamePage)
  const sfxBeforeWait = sfxDispatches.length
  const claimsBeforeWait = sfxClaims.length

  await act(async () => { waitSocket.deliver("night_presentation_wait", waitPayload) })
  assert.notEqual(waitView.container.querySelector("[data-ingame-night-presentation-wait]"), null,
    "실제 InGamePage가 비수신자에게 대기 화면을 띄우지 않았다")
  assert.equal(waitView.container.textContent.includes(INGAME_NIGHT_PRESENTATION_WAIT_MESSAGE), true)
  assert.equal(waitView.container.querySelector("video[src]"), null, "비수신자 화면에 연출 영상이 떴다")
  for (const secret of [waitCtx.jokerUuid, waitCtx.citizenUuid, "KILL", "JOKER"]) {
    assert.equal(waitView.container.innerHTML.includes(secret), false,
      `대기 중 화면에 ${secret}이(가) 노출됐다`)
  }
  assert.equal(sfxDispatches.length, sfxBeforeWait, "대기 시작이 새 소리를 만들었다")
  assert.equal(sfxClaims.length, claimsBeforeWait, "대기 시작이 내장음 소유권을 선점했다")
  assert.equal(waitSocket.emitsFor("acknowledge_night_action_success").length, 0,
    "비수신자가 완료 보고를 보냈다")
  resetScreenBetweenScenes()

  const ctx = setupBackendNight("f27bl-prod-flow")
  assert.deepEqual(ctx.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
  const killPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(ctx, ctx.citizenUuid)
  const socket = createFrontSocket({ forwardEmitTo: ctx.backendSockets.get(ctx.citizenUuid) })
  const view = await mountInGamePageDirect(socket, InGamePage)

  await act(async () => { socket.deliver("night_action_success", killPayload) })
  const killVideo = view.container.querySelector("video[src]")
  assert.notEqual(killVideo, null, "실제 페이지가 KILL 연출 영상을 마운트하지 않았다")
  assert.equal(killVideo.getAttribute("src"), NIGHT_SUCCESS_VIDEO["KILL-TARGET"])
  await act(async () => { await flushMicrotasks() })
  assert.equal(killVideo.muted, false, "Master×SFX가 모두 100인데 영상이 음소거다(AC-03)")

  await act(async () => { fireEvent(killVideo, new dom.window.Event("ended")) })
  const killAcks = socket.emitsFor("acknowledge_night_action_success")
  assert.equal(killAcks.length, 1, "정상 종료가 완료 보고 한 번으로 이어지지 않았다")
  assert.deepEqual(killAcks[0].response, { ok: true, duplicate: false })
  assert.equal(view.container.querySelector("video[src]"), null, "완료한 연출이 화면에 남았다")
  assert.equal(ctx.session.nightTurnRole, null, "한 수신자 완료만으로 다음 역할이 시작됐다")
  const timersOnWaitRelease = captureServerScheduledTimers(() => { ctx.ack(ctx.jokerUuid, killPayload) })
  assert.equal(ctx.session.nightTurnRole, "DOCTOR", "두 수신자가 모두 끝났는데 다음 역할이 없다")
  assert.deepEqual(timersOnWaitRelease, [], "연출 대기 해제가 낮 타이머를 예약했다")

  assert.deepEqual(ctx.submit(ctx.doctorUuid, ctx.citizenUuid), { ok: true })
  const healPayload = ctx.receivedBy(ctx.citizenUuid, "night_action_success")[1]?.payload
  assert.ok(healPayload, "전제: 대상자가 HEAL 성공 사건을 받아야 한다")
  await act(async () => { socket.deliver("night_action_success", healPayload) })
  const healVideo = view.container.querySelector("video[src]")
  assert.notEqual(healVideo, null, "HEAL-TARGET 영상이 뜨지 않았다")
  assert.equal(healVideo.getAttribute("src"), NIGHT_SUCCESS_VIDEO["HEAL-TARGET"])
  await act(async () => { fireEvent(healVideo, new dom.window.Event("ended")) })
  assert.equal(socket.emitsFor("acknowledge_night_action_success").length, 2,
    "두 번째 연출의 완료 보고가 없다")
  ctx.ack(ctx.doctorUuid, healPayload)
  assert.deepEqual(useInGameStore.getState().nightSuccessQueue, [], "두 연출을 소비했는데 큐가 남았다")

  assert.equal(view.container.querySelector("[data-ingame-night-success-final]"), null,
    "밤 결과가 반영되기 전에 최종 상태가 떴다")
  const nightDayIndex = ctx.session.dayIndex
  assert.equal(ctx.receivedBy(ctx.citizenUuid, "night_result_applied").length, 0,
    "전제: 아직 밤이 최종화되지 않았다")

  const dayTimerCalls = driveRemainingNightRolesToFinalization(ctx)
  assert.equal(ctx.session.phase, "DAY", "실제 서버가 밤을 최종화하지 않았다")
  const nextDayIndex = ctx.session.dayIndex
  assert.equal(nextDayIndex, nightDayIndex + 1, "최종화가 다음 낮으로 넘기지 않았다")
  assert.equal(dayTimerCalls.length, 1,
    `밤 최종화 뒤 낮 타이머가 정확히 한 번 예약되지 않았다(${dayTimerCalls.map((c) => c.delay).join(",")})`)

  const applied = ctx.receivedBy(ctx.citizenUuid, "night_result_applied")
  assert.equal(applied.length, 1, "서버 최종화가 밤 결과 전달을 만들지 않았다")
  await act(async () => { socket.deliver("night_result_applied", applied[0].payload) })
  assert.equal(useInGameStore.getState().state.phase, "DAY", "서버 밤 결과가 화면에 반영되지 않았다")
  assert.equal(useInGameStore.getState().state.dayIndex, nextDayIndex)
  const finalPanel = view.container.querySelector("[data-ingame-night-success-final]")
  assert.notEqual(finalPanel, null, "킬+치료 두 연출을 마친 대상자에게 최종 생존 표시가 뜨지 않았다")
  assert.equal(finalPanel.getAttribute("data-ingame-night-success-final"), "ALIVE",
    "치료로 살아남은 대상자가 사망으로 표시됐다")
  assert.equal(socket.emitsFor("acknowledge_night_action_success").length, 2,
    "최종 생존 표시가 추가 완료 보고를 만들었다")
  resetScreenBetweenScenes()

  const failCtx = setupBackendNight("f27bl-prod-retry")
  assert.deepEqual(failCtx.submit(failCtx.jokerUuid, failCtx.citizenUuid), { ok: true })
  const failPayload = failCtx.receivedBy(failCtx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(failCtx, failCtx.citizenUuid)
  const failSocket = createFrontSocket({ forwardEmitTo: failCtx.backendSockets.get(failCtx.citizenUuid) })
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  try {
    dom.window.HTMLMediaElement.prototype.play = function blockedPlay() {
      const err = new Error("NotAllowedError")
      err.name = "NotAllowedError"
      return Promise.reject(err)
    }
    const failView = await mountInGamePageDirect(failSocket, InGamePage)
    await act(async () => { failSocket.deliver("night_action_success", failPayload) })
    await act(async () => { await flushMicrotasks() })

    const killPanel = () => failView.container.querySelector("[data-ingame-night-success-kill]")
    assert.notEqual(killPanel(), null, "KILL 연출 자체가 마운트되지 않았다")
    assert.notEqual(findRetrySurface(killPanel()), null,
      "자동재생 차단인데 재시도 화면이 뜨지 않았다")
    assert.equal(failSocket.emitsFor("acknowledge_night_action_success").length, 0,
      "재시도 화면에서 이미 완료를 보고했다")

    await act(async () => { findRetrySurface(killPanel()).click() })
    await act(async () => { await flushMicrotasks() })
    assert.equal(failSocket.emitsFor("acknowledge_night_action_success").length, 0,
      "재시도 실패가 완료 보고를 만들었다")

    const skipButton = findButton(killPanel(), INGAME_KILL_REVEAL_SKIP_LABEL)
    assert.notEqual(skipButton, null, "재시도 화면에 건너뛰기가 없어 연출을 빠져나갈 수 없다")
    await act(async () => { skipButton.click() })
    const skipAcks = failSocket.emitsFor("acknowledge_night_action_success")
    assert.equal(skipAcks.length, 1, "건너뛰기가 완료 보고 한 번으로 이어지지 않았다")
    assert.equal(skipAcks[0].payload.outcome, "SKIPPED", "건너뛰기가 SKIPPED로 보고되지 않았다")
    assert.deepEqual(skipAcks[0].response, { ok: true, duplicate: false })
    assert.equal(failCtx.session.nightTurnRole, null, "한 수신자의 건너뛰기만으로 다음 역할이 시작됐다")
    failCtx.ack(failCtx.jokerUuid, failPayload, "SKIPPED")
    assert.equal(failCtx.session.nightTurnRole, "DOCTOR", "두 수신자가 모두 끝났는데 다음 역할이 없다")
  } finally {
    dom.window.HTMLMediaElement.prototype.play = originalPlay
  }
  resetScreenBetweenScenes()

  const retryCtx = setupBackendNight("f27bl-prod-retry-ok")
  assert.deepEqual(retryCtx.submit(retryCtx.jokerUuid, retryCtx.citizenUuid), { ok: true })
  const retryPayload = retryCtx.receivedBy(retryCtx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(retryCtx, retryCtx.citizenUuid)
  const retrySocket = createFrontSocket({
    forwardEmitTo: retryCtx.backendSockets.get(retryCtx.citizenUuid),
  })
  const retryOriginalPlay = dom.window.HTMLMediaElement.prototype.play
  try {
    let autoplayBlocked = true
    dom.window.HTMLMediaElement.prototype.play = function maybeBlockedPlay() {
      if (!autoplayBlocked) return Promise.resolve()
      const err = new Error("NotAllowedError")
      err.name = "NotAllowedError"
      return Promise.reject(err)
    }
    const retryView = await mountInGamePageDirect(retrySocket, InGamePage)
    await act(async () => { retrySocket.deliver("night_action_success", retryPayload) })
    await act(async () => { await flushMicrotasks() })
    const retryPanel = () => retryView.container.querySelector("[data-ingame-night-success-kill]")
    assert.notEqual(findRetrySurface(retryPanel()), null,
      "전제: 자동재생 차단이면 재시도 화면이 뜬다")

    autoplayBlocked = false
    await act(async () => { findRetrySurface(retryPanel()).click() })
    await act(async () => { await flushMicrotasks() })
    assert.equal(findRetrySurface(retryPanel()), null,
      "재생이 풀렸는데 재시도 화면이 남아 있다")
    assert.equal(retrySocket.emitsFor("acknowledge_night_action_success").length, 0,
      "재생 중에 완료를 보고했다")

    const retryVideo = retryView.container.querySelector("video[src]")
    assert.notEqual(retryVideo, null, "재시도 성공 뒤 연출 영상이 사라졌다")
    await act(async () => { fireEvent(retryVideo, new dom.window.Event("ended")) })
    const retryAcks = retrySocket.emitsFor("acknowledge_night_action_success")
    assert.equal(retryAcks.length, 1, "재시도 성공 뒤 정상 종료가 완료 보고 한 번으로 이어지지 않았다")
    assert.deepEqual(retryAcks[0].payload, {
      gameId: retryCtx.session.id,
      nightDayIndex: retryPayload.nightDayIndex,
      eventId: retryPayload.eventId,
    })
    assert.deepEqual(retryAcks[0].response, { ok: true, duplicate: false })
    const retryStored = retryCtx.gameSessionSocketLayer.__testables
      .__getNightSuccessReceiptsForTests(retryCtx.session)
    assert.equal(retryStored.byEvent.get(retryPayload.eventId).get(retryCtx.citizenUuid).completed, true,
      "재시도 성공의 완료가 서버 기록에 남지 않았다")
    assert.equal(retryCtx.session.nightTurnRole, null, "한 수신자 완료만으로 다음 역할이 시작됐다")
    retryCtx.ack(retryCtx.jokerUuid, retryPayload)
    assert.equal(retryCtx.session.nightTurnRole, "DOCTOR", "두 수신자가 모두 끝났는데 다음 역할이 없다")
  } finally {
    dom.window.HTMLMediaElement.prototype.play = retryOriginalPlay
  }
  resetScreenBetweenScenes()

  const errorCtx = setupBackendNight("f27bl-prod-error")
  const errorOutsider = pickOutsider(errorCtx)
  assert.deepEqual(errorCtx.submit(errorCtx.jokerUuid, errorCtx.citizenUuid), { ok: true })
  const errorPayload = errorCtx.receivedBy(errorCtx.citizenUuid, "night_action_success")[0].payload
  assert.equal(errorCtx.receivedBy(errorOutsider, "night_presentation_wait").length, 1,
    "전제: 비수신자의 대기가 시작돼 있어야 한다")

  seedFrontSession(errorCtx, errorCtx.citizenUuid)
  const errorSocket = createFrontSocket({
    forwardEmitTo: errorCtx.backendSockets.get(errorCtx.citizenUuid),
  })
  const errorView = await mountInGamePageDirect(errorSocket, InGamePage)
  await act(async () => { errorSocket.deliver("night_action_success", errorPayload) })
  const errorVideo = errorView.container.querySelector("video[src]")
  assert.notEqual(errorVideo, null, "연출 영상이 시작되지 않았다")

  await act(async () => { fireEvent(errorVideo, new dom.window.Event("error")) })
  const errorAcks = errorSocket.emitsFor("acknowledge_night_action_success")
  assert.equal(errorAcks.length, 1, "재생 오류가 완료 보고 한 번으로 이어지지 않았다")
  assert.equal(errorAcks[0].payload.outcome, "ERROR", "재생 오류가 ERROR로 보고되지 않았다")
  assert.deepEqual(errorAcks[0].response, { ok: true, duplicate: false })
  assert.equal(errorView.container.querySelector("[data-ingame-night-success-kill]"), null,
    "오류로 끝난 연출이 화면에 남았다")
  assert.equal(errorCtx.session.nightTurnRole, null, "한 수신자의 오류만으로 다음 역할이 시작됐다")

  errorCtx.ack(errorCtx.jokerUuid, errorPayload, "ERROR")
  const errorRelease = errorCtx.receivedBy(errorOutsider, "night_presentation_wait")
  assert.equal(errorRelease.length, 2, "ERROR 보고로도 비수신자의 대기가 풀리지 않았다")
  assert.equal(errorRelease[1].payload.waiting, false)
  assert.equal(errorCtx.session.nightTurnRole, "DOCTOR", "ERROR 뒤 다음 역할이 시작되지 않았다")
  resetScreenBetweenScenes()

  const canvasErrorCtx = setupBackendNight("f27bl-prod-canvas-error")
  assert.deepEqual(canvasErrorCtx.submit(canvasErrorCtx.jokerUuid, canvasErrorCtx.citizenUuid), { ok: true })
  const canvasErrorPayload = canvasErrorCtx.receivedBy(canvasErrorCtx.citizenUuid, "night_action_success")[0].payload

  seedFrontSession(canvasErrorCtx, canvasErrorCtx.citizenUuid)
  const canvasErrorSocket = createFrontSocket({
    forwardEmitTo: canvasErrorCtx.backendSockets.get(canvasErrorCtx.citizenUuid),
  })
  integrationCanvasContextFactory = () => null
  let canvasErrorView
  try {
    canvasErrorView = await mountInGamePageDirect(canvasErrorSocket, InGamePage)
    await act(async () => { canvasErrorSocket.deliver("night_action_success", canvasErrorPayload) })
    await act(async () => { await flushMicrotasks() })

    const canvasErrorAcks = canvasErrorSocket.emitsFor("acknowledge_night_action_success")
    assert.equal(canvasErrorAcks.length, 1, "canvas 컨텍스트 획득 실패가 완료 보고 한 번으로 이어지지 않았다")
    assert.equal(canvasErrorAcks[0].payload.outcome, "ERROR", "canvas 실패가 ERROR로 보고되지 않았다")
    assert.deepEqual(canvasErrorAcks[0].response, { ok: true, duplicate: false })
    assert.equal(canvasErrorView.container.querySelector("[data-ingame-night-success-kill]"), null,
      "canvas 실패로 끝난 연출이 화면에 남았다")
  } finally {
    resetIntegrationCanvasContextFactory()
  }
  canvasErrorCtx.ack(canvasErrorCtx.jokerUuid, canvasErrorPayload, "ERROR")
  assert.equal(canvasErrorCtx.session.nightTurnRole, "DOCTOR", "canvas ERROR 뒤 다음 역할이 시작되지 않았다")

  assert.deepEqual(canvasErrorCtx.submit(canvasErrorCtx.doctorUuid, canvasErrorCtx.citizenUuid), { ok: true })
  const canvasNextPayload = canvasErrorCtx.receivedBy(canvasErrorCtx.citizenUuid, "night_action_success")[1]?.payload
  assert.ok(canvasNextPayload, "전제: canvas 실패 뒤에도 대상자가 다음(HEAL) 사건을 받아야 한다")
  assert.notEqual(canvasNextPayload.eventId, canvasErrorPayload.eventId)

  await act(async () => { canvasErrorSocket.deliver("night_action_success", canvasNextPayload) })
  const canvasNextVideo = canvasErrorView.container.querySelector("video[src]")
  assert.notEqual(canvasNextVideo, null, "canvas 실패 뒤 다음 사건이 화면에 표시되지 않았다")
  assert.equal(canvasNextVideo.getAttribute("src"), NIGHT_SUCCESS_VIDEO["HEAL-TARGET"])
  assert.notEqual(canvasErrorView.container.querySelector("canvas"), null,
    "canvas 실패 뒤 다음 사건에 표시 canvas가 렌더되지 않았다")

  await act(async () => { fireEvent(canvasNextVideo, new dom.window.Event("ended")) })
  const canvasNextAcks = canvasErrorSocket.emitsFor("acknowledge_night_action_success")
  assert.equal(canvasNextAcks.length, 2, "다음 사건의 정상 종료가 완료 보고로 이어지지 않았다")
  assert.deepEqual(canvasNextAcks[1].payload, {
    gameId: canvasErrorCtx.session.id,
    nightDayIndex: canvasNextPayload.nightDayIndex,
    eventId: canvasNextPayload.eventId,
  })
  canvasErrorCtx.ack(canvasErrorCtx.doctorUuid, canvasNextPayload)
  resetScreenBetweenScenes()

  const lastCtx = setupBackendLastNight("f27bl-prod-last-night")
  assert.deepEqual(lastCtx.submit(lastCtx.jokerUuid, lastCtx.targetUuid), { ok: true })
  const lastPayload = lastCtx.receivedBy(lastCtx.targetUuid, "night_action_success")[0].payload

  seedFrontSession(lastCtx, lastCtx.targetUuid)
  const lastSocket = createFrontSocket({ forwardEmitTo: lastCtx.backendSockets.get(lastCtx.targetUuid) })
  const lastView = await mountInGamePageDirect(lastSocket, InGamePage)

  await act(async () => { lastSocket.deliver("night_action_success", lastPayload) })
  const lastVideo = privateKillVideo(lastView)
  assert.notEqual(lastVideo, null, "마지막 밤의 연출 영상이 시작되지 않았다")
  assert.equal(lastCtx.session.phase, "NIGHT", "전제: 연출 중에는 아직 밤이다")
  assert.equal(lastView.container.querySelector("[data-test-game-result]"), null,
    "연출 중에 결과 화면으로 넘어갔다")

  await act(async () => { fireEvent(lastVideo, new dom.window.Event("ended")) })
  const lastAcks = lastSocket.emitsFor("acknowledge_night_action_success")
  assert.equal(lastAcks.length, 1, "마지막 밤의 완료 보고가 정확히 한 번이 아니다")
  assert.deepEqual(lastAcks[0].response, { ok: true, duplicate: false })
  assert.equal(lastView.container.querySelector("[data-test-game-result]"), null,
    "완료 보고만으로 결과 화면으로 넘어갔다(서버는 아직 종료를 방송하지 않았다)")

  lastCtx.ack(lastCtx.jokerUuid, lastPayload)
  assert.equal(lastCtx.session.nightTurnRole, "DOCTOR", "두 수신자가 모두 끝났는데 다음 역할이 없다")
  const lastNightTimers = driveRemainingNightRolesToFinalization(lastCtx)
  assert.equal(lastCtx.session.phase, "ENDED", "그 밤의 킬로 경기가 끝나지 않았다")
  assert.deepEqual(lastCtx.session.winResult, { winner: "JOKER" })
  assert.equal(lastCtx.session.players.get(lastCtx.targetUuid).alive, false)
  assert.deepEqual(lastNightTimers, [], "경기가 끝났는데 다음 낮 타이머가 예약됐다")

  const lastApplied = lastCtx.receivedBy(lastCtx.targetUuid, "night_result_applied")
  assert.equal(lastApplied.length, 1, "서버 최종화가 결과 전달을 만들지 않았다")
  assert.equal(lastApplied[0].payload.phase, "ENDED")
  assert.equal(lastApplied[0].payload.winResult.winner, "JOKER")
  assert.ok(Array.isArray(lastApplied[0].payload.winResult.reveals), "종료 payload의 공개 winResult에는 reveals가 실린다")
  assert.equal(lastView.container.querySelector("[data-test-game-result]"), null,
    "서버가 종료했다는 사실만으로 화면이 먼저 넘어갔다")

  await act(async () => { lastSocket.deliver("night_result_applied", lastApplied[0].payload) })
  assert.equal(useInGameStore.getState().state.phase, "ENDED", "서버 종료가 화면에 반영되지 않았다")
  await act(async () => { await flushMicrotasks() })
  assert.notEqual(lastView.container.querySelector("[data-test-game-result]"), null,
    "종료가 반영됐는데 결과 화면으로 가지 않았다")
  assert.equal(lastView.navigations.filter((path) => path === "/gameresult").length, 1,
    "결과 화면 이동이 정확히 한 번이 아니다")
  assert.equal(lastSocket.emitsFor("acknowledge_night_action_success").length, 1,
    "결과 이동이 추가 완료 보고를 만들었다")
  resetScreenBetweenScenes()
})
