import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
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

const alerts = []
const recordAlert = (message) => alerts.push(message)
installDomGlobal("alert", recordAlert)
dom.window.alert = recordAlert

let confirmAnswer = true
const confirmCalls = []
const recordConfirm = (message) => {
  confirmCalls.push(message)
  return confirmAnswer
}
installDomGlobal("confirm", recordConfirm)
dom.window.confirm = recordConfirm

const scheduledTimeouts = []
const nativeSetTimeout = dom.window.setTimeout.bind(dom.window)
const nativeClearTimeout = dom.window.clearTimeout.bind(dom.window)
installDomGlobal("__fireExitTimeouts", () => {
  const due = scheduledTimeouts.splice(0, scheduledTimeouts.length)
  for (const entry of due) if (!entry.cancelled) entry.fn()
})
dom.window.setTimeout = (fn, delay, ...rest) => {
  if (delay >= 1000) {
    const entry = { fn, cancelled: false, id: Symbol("exit-timeout") }
    scheduledTimeouts.push(entry)
    return entry.id
  }
  return nativeSetTimeout(fn, delay, ...rest)
}
dom.window.clearTimeout = (id) => {
  const entry = scheduledTimeouts.find((candidate) => candidate.id === id)
  if (entry) {
    entry.cancelled = true
    return undefined
  }
  return nativeClearTimeout(id)
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
mock.module("@/shared/hooks/useSfxRuntime.js", {
  namedExports: {
    dispatchSfxEvent: () => {},
    dispatchUiSfx: () => {},
    useSfxRuntime: () => {},
    getSfxMix: () => ({ gain: 0, muted: true }),
    subscribeSfxMix: () => () => {},
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

function createFakeSocket(id = "sock-1") {
  const listeners = new Map()
  const emitted = []
  const pendingAcks = []
  return {
    id,
    connected: true,
    emitted,
    pendingAcks,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    emit(event, payload, ack) {
      emitted.push({ event, payload })
      if (typeof ack === "function") pendingAcks.push({ event, payload, ack })
    },
    timeout() { return this },
    emitWithAck(event, payload) {
      emitted.push({ event, payload })
      return new Promise((resolve) => { pendingAcks.push({ event, payload, ack: resolve }) })
    },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    countEmits(event) { return emitted.filter((e) => e.event === event).length },
    subscribedEvents() { return [...listeners.keys()] },
    takeAck(event) {
      for (let i = pendingAcks.length - 1; i >= 0; i -= 1) {
        if (pendingAcks[i].event === event) return pendingAcks.splice(i, 1)[0]
      }
      return null
    },
  }
}

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

const { render, act, cleanup, waitFor } = await import("@testing-library/react")
const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../../../../src/app/routes/index.jsx")
const { default: ProtectedRoute } = await import("../../../../src/shared/ui/ProtectedRoute.jsx")
const { useInGameStore } = await import("../../../../src/domains/game/ingame/store/ingameStore.js")
const { useMatchingStore } = await import("../../../../src/domains/game/matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const GAME_ID = "game-dead-choice"
const SELF = "uuid-self"
const OTHER = "uuid-other"
const MY_MEMBERSHIP = "mem-self-1"

const CHOICE_LABEL = "사망 후 선택"

function rosterPlayers({ selfAlive }) {
  return [
    {
      uuid: SELF, nickname: "나", alive: selfAlive, isConnected: true,
      isParticipating: true, membershipId: MY_MEMBERSHIP, themeIndex: 0,
    },
    {
      uuid: OTHER, nickname: "상대", alive: true, isConnected: true,
      isParticipating: true, membershipId: "mem-other-1", themeIndex: 1,
    },
  ]
}

function seedLiveGame({ selfAlive = true, phase = "DAY", dayIndex = 1 } = {}) {
  useAuthStore.setState({
    isLoggedIn: true, user: { uuid: SELF, nickname: "나" },
    loggedOutIntentionally: false, identityGeneration: 1,
  })
  useInGameStore.setState({
    gameId: GAME_ID,
    hostUuid: OTHER,
    error: null,
    snapshotSeq: 0,
    nightPrivateResult: null,
    state: {
      id: GAME_ID,
      phase,
      dayIndex,
      dayPhase: phase === "DAY" ? "DAY_DISCUSSION" : null,
      players: rosterPlayers({ selfAlive }),
      self: {
        uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN",
        hasActedThisPhase: false, hasAcknowledgedRoleReveal: true,
      },
      tribunal: null,
      winResult: null,
      nightResult: null,
      dayVoteResolution: null,
      participationRevision: 0,
    },
  })
}

async function mountInGame() {
  alerts.length = 0
  confirmCalls.length = 0
  confirmAnswer = true
  scheduledTimeouts.length = 0
  currentSocket = createFakeSocket()
  for (const cb of [...socketSubscribers]) cb()

  let view
  await act(async () => {
    view = render(React.createElement(RouterProvider, { router }))
  })
  await act(async () => { await router.navigate("/ingame") })
  await dismissParchmentOverlays(view.container)
  return view
}

function findButton(container, label) {
  return [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label) ?? null
}

async function dismissParchmentOverlays(container) {
  for (let i = 0; i < 5; i += 1) {
    const confirmButton = findButton(container, "확인")
    if (!confirmButton) return
    await act(async () => { confirmButton.click() })
  }
}

function choicePanel(container) {
  return container.querySelector(`[aria-label='${CHOICE_LABEL}']`)
}

function swapMyMembership(next) {
  useInGameStore.setState((s) => ({
    state: {
      ...s.state,
      players: s.state.players.map((p) => (p.uuid === SELF ? { ...p, membershipId: next } : p)),
    },
  }))
}

function myMembership() {
  return useInGameStore.getState().state?.players?.find((p) => p.uuid === SELF)?.membershipId ?? null
}

test.afterEach(async () => {
  cleanup()
  await act(async () => { await router.navigate("/lobby") })
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
})

test("F-23(SPLIT-1/AC-02): 실제 라우터에 외부 관전 경로가 없고 정상 참가 경로는 보호 아래 그대로다", () => {
  const collectPaths = (routes, guarded = false) => routes.flatMap((route) => {
    const isGuard = route.element?.type === ProtectedRoute
    const here = route.path ? [{ path: route.path, guarded }] : []
    return [...here, ...collectPaths(route.children ?? [], guarded || isGuard)]
  })

  const declared = collectPaths(router.routes)
  assert.ok(declared.length > 0, "라우터에서 경로를 하나도 읽지 못했다(이 검사가 무력하다)")

  const spectatorRoutes = declared.filter(({ path }) => /spectat|watch-only|observer|관전/i.test(path))
  assert.deepEqual(spectatorRoutes, [], `외부 관전 라우트가 남아 있다: ${JSON.stringify(spectatorRoutes)}`)

  for (const path of ["/game-setup", "/game-matching", "/ingame"]) {
    const found = declared.find((route) => route.path === path)
    assert.ok(found, `${path} 경로가 사라졌다`)
    assert.equal(found.guarded, true, `${path}가 인증 보호 밖으로 나왔다`)
  }
})

test("F-23(SPLIT-1/AC-02): 비로그인 /ingame 직접 진입은 로그인으로 돌아가고 인게임 화면을 그리지 않는다", async () => {
  useAuthStore.setState({
    isLoggedIn: false, user: null, loggedOutIntentionally: false, identityGeneration: 1,
  })
  alerts.length = 0
  currentSocket = createFakeSocket()
  for (const cb of [...socketSubscribers]) cb()

  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router })) })
  await act(async () => { await router.navigate("/ingame") })

  await waitFor(() => assert.equal(router.state.location.pathname, "/login"))
  assert.equal(view.container.querySelector("button[aria-label='게임 나가기']"), null,
    "비로그인인데 인게임 화면이 그려졌다")
  assert.equal(choicePanel(view.container), null)
  assert.ok(alerts.includes("로그인이 필요한 페이지입니다!"), "보호 라우트의 안내가 없다")
})

test("F-23(AC-06): 생존 중인 참가자에게는 사망 선택이 보이지 않는다", async () => {
  seedLiveGame({ selfAlive: true })
  const { container } = await mountInGame()

  assert.equal(choicePanel(container), null, "생존자에게 사망 선택이 떴다")
  assert.equal(container.textContent.includes("관전 계속하기"), false)
})

test("F-23(AC-06): 실제 밤 판정 사건으로 확정 사망하면 두 선택이 뜨고, 계속 보기는 서버 요청 0회다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 0 })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "DAY", dayIndex: 1,
      players: [{ uuid: SELF, alive: false }, { uuid: OTHER, alive: true }],
      victimUuid: SELF,
      deathReveals: [],
    })
  })
  await dismissParchmentOverlays(container)

  assert.equal(
    useInGameStore.getState().state.players.find((p) => p.uuid === SELF).alive, false,
    "전제: 서버 사건으로 본인이 확정 사망해야 한다",
  )
  assert.ok(choicePanel(container), "확정 사망인데 선택이 뜨지 않았다")
  assert.ok(findButton(container, "관전 계속하기"), "관전 계속하기 버튼이 없다")
  assert.ok(findButton(container, "게임 나가기"), "게임 나가기 버튼이 없다")

  const emitsBefore = socket.emitted.length
  const roleBefore = useInGameStore.getState().state.self.role
  await act(async () => { findButton(container, "관전 계속하기").click() })

  assert.equal(socket.emitted.length, emitsBefore, "계속 보기가 서버 요청을 만들었다")
  assert.equal(choicePanel(container), null, "계속 보기 뒤에도 선택창이 남아 있다")
  const seated = useInGameStore.getState().state.players.find((p) => p.uuid === SELF)
  assert.equal(seated.membershipId, MY_MEMBERSHIP, "계속 보기로 소속이 바뀌었다")
  assert.equal(seated.isParticipating, true, "계속 보기로 참여 자격이 바뀌었다")
  assert.equal(useInGameStore.getState().state.self.role, roleBefore, "계속 보기가 역할을 바꿨다")
  assert.equal(useInGameStore.getState().state.self.uuid, SELF, "계속 보기가 신원을 바꿨다")

  const dayVoteOnlyControl = () =>
    container.querySelector('[data-ingame-phase-action="dayVoteAbstain"]')
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_DISCUSSION")
  assert.ok(findButton(container, "투표 시작 준비"), "전제: 토론 구간 화면이어야 한다")
  assert.equal(dayVoteOnlyControl(), null, "토론 구간인데 투표 구간 전용 컨트롤이 떠 있다")

  await act(async () => {
    socket.deliver("day_phase_changed", {
      gameId: GAME_ID, dayIndex: 1, dayPhase: "DAY_VOTE", round: 1,
    })
  })
  assert.equal(choicePanel(container), null, "공개 사건이 접힌 선택창을 되살렸다")
  assert.equal(
    useInGameStore.getState().state.dayPhase, "DAY_VOTE",
    "공개 진행 사건이 store의 낮 구간을 갱신하지 않았다",
  )
  await waitFor(() => assert.notEqual(
    dayVoteOnlyControl(), null,
    "공개 진행 사건이 화면에 반영되지 않았다",
  ))
  assert.equal(findButton(container, "투표 시작 준비"), null, "이전 구간 화면이 그대로 남아 있다")

  assert.ok(container.querySelector("button[aria-label='게임 나가기']"), "상단 나가기 버튼이 사라졌다")
})

test("F-25b(AC-02/AC-04): 치료가 성공한 밤의 결과를 받으면 사망 선택이 뜨지 않고 화면도 /ingame에 남는다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 0 })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "DAY", dayIndex: 1,
      players: [{ uuid: SELF, alive: true }, { uuid: OTHER, alive: true }],
      victimUuid: null,
      deathReveals: [],
    })
  })
  await dismissParchmentOverlays(container)

  assert.equal(
    useInGameStore.getState().state.players.find((p) => p.uuid === SELF).alive, true,
    "치료가 성공했는데 canonical 사망으로 반영됐다",
  )
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.equal(useInGameStore.getState().state.winResult ?? null, null, "치료 성공 밤이 승패를 확정했다")
  assert.equal(choicePanel(container), null, "생존자에게 사망 선택이 떴다")
  assert.equal(router.state.location.pathname, "/ingame", "치료 성공 밤인데 화면을 떠났다")
})

test("F-25b(AC-04) 대조군: 같은 마지막 밤이 치료 없이 종결되면 결과 화면으로 넘어간다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 0 })
  await mountInGame()
  const socket = currentSocket
  assert.equal(router.state.location.pathname, "/ingame", "전제: 아직 진행 중이다")

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 0,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "JOKER" },
      deathReveals: [],
    })
  })

  assert.equal(useInGameStore.getState().state.phase, "ENDED")
  assert.deepEqual(useInGameStore.getState().state.winResult, { winner: "JOKER" })
  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "종결된 밤인데 결과 화면으로 넘어가지 못했다",
  ))
})

test("F-23(AC-06): 나가기 성공 ACK는 정확히 한 번 정리하고 로비로 replace 이동한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  assert.ok(choicePanel(container), "전제: 확정 사망 선택이 떠 있어야 한다")

  await act(async () => { findButton(container, "게임 나가기").click() })
  assert.equal(confirmCalls.length, 1, "확인 대화상자가 한 번 떠야 한다")
  assert.equal(socket.countEmits("leave_game_session"), 1)

  await act(async () => { container.querySelector("button[aria-label='게임 나가기']").click() })
  assert.equal(confirmCalls.length, 1, "pending 중에 확인 대화상자가 다시 떴다")
  assert.equal(socket.countEmits("leave_game_session"), 1, "pending 중 중복 전송이 일어났다")

  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, null, "성공 ACK인데 인게임 store가 정리되지 않았다")
  assert.equal(useMatchingStore.getState().isInRoom, false)
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))

  await act(async () => { pending.ack({ ok: true }) })
  assert.equal(router.state.location.pathname, "/multiplay")
})

test("F-23(AC-06 보수): 언마운트 뒤 도착한 늦은 성공 ACK는 store를 정리하지도 이동하지도 않는다", async () => {
  seedLiveGame({ selfAlive: false })
  const view = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(view.container, "게임 나가기").click() })
  assert.equal(socket.countEmits("leave_game_session"), 1, "전제: 나가기 요청이 실제로 나가야 한다")
  const pending = socket.takeAck("leave_game_session")

  await act(async () => { view.unmount() })
  const pathAfterUnmount = router.state.location.pathname
  const stateBefore = useInGameStore.getState().state

  await act(async () => { pending.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, GAME_ID, "언마운트 뒤 늦은 성공 ACK가 인게임 store를 정리했다")
  assert.equal(useInGameStore.getState().state, stateBefore, "언마운트 뒤 늦은 성공 ACK가 게임 상태를 바꿨다")
  assert.equal(myMembership(), MY_MEMBERSHIP, "언마운트 뒤 늦은 ACK가 내 소속을 지웠다")
  assert.equal(router.state.location.pathname, pathAfterUnmount,
    "언마운트 뒤 늦은 성공 ACK가 화면을 이동시켰다")

  await act(async () => { pending.ack({ ok: true }) })
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.equal(router.state.location.pathname, pathAfterUnmount)
})

test("F-23(AC-06): 나가기 취소는 아무것도 보내지 않고 화면에 남는다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket
  confirmAnswer = false

  await act(async () => { findButton(container, "게임 나가기").click() })

  assert.equal(confirmCalls.length, 1)
  assert.equal(socket.countEmits("leave_game_session"), 0, "취소했는데 요청이 나갔다")
  assert.equal(router.state.location.pathname, "/ingame")
  assert.ok(choicePanel(container), "취소 뒤 선택창이 사라졌다")
})

test("F-23(AC-06): 실패 ACK는 이동 0이고 재시도를 열어 둔다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.equal(router.state.location.pathname, "/ingame", "실패했는데 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패했는데 인게임 store가 정리됐다")
  assert.ok(choicePanel(container).textContent.includes("실패"), "실패 안내가 없다")

  await act(async () => { findButton(container, "다시 시도").click() })
  assert.equal(confirmCalls.length, 1, "재시도가 확인 대화상자를 다시 띄웠다")
  assert.equal(socket.countEmits("leave_game_session"), 2)

  const retryAck = socket.takeAck("leave_game_session")
  await act(async () => { retryAck.ack({ ok: true }) })
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-23(AC-06): ACK 유실은 성공이 아니며, 권위 있는 확인 뒤에만 정확히 한 번 정리한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  socket.takeAck("leave_game_session")

  await act(async () => { globalThis.__fireExitTimeouts() })

  assert.equal(router.state.location.pathname, "/ingame", "ACK 없음만으로 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.ok(choicePanel(container).textContent.includes("확인하지 못했습니다"), "미확정 안내가 없다")

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const firstCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { firstCheck.ack({ ok: false, code: "SESSION_NOT_FOUND" }) })
  assert.equal(router.state.location.pathname, "/ingame", "SESSION_NOT_FOUND를 성공으로 바꿨다")

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const secondCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { secondCheck.ack({ ok: false, code: "FORFEITED_FROM_SESSION" }) })

  assert.equal(useInGameStore.getState().gameId, null, "권위 확인 뒤에도 정리되지 않았다")
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-23(AC-06): 권위 확인이 '아직 참여 중'이면 정리하지 않고 재시도를 연다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  socket.takeAck("leave_game_session")
  await act(async () => { globalThis.__fireExitTimeouts() })

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const check = socket.takeAck("get_session_snapshot")
  await act(async () => {
    check.ack({
      ok: true, gameId: GAME_ID, phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION",
      players: rosterPlayers({ selfAlive: false }).map((p) => ({
        uuid: p.uuid, nickname: p.nickname, isAlive: p.alive, isConnected: true,
      })),
      self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    })
  })

  assert.equal(router.state.location.pathname, "/ingame", "아직 참여 중인데 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.ok(findButton(container, "다시 시도"), "재시도 수단이 열리지 않았다")
})

async function arriveAtTopExitAfterKeepWatching() {
  seedLiveGame({ selfAlive: false })
  const view = await mountInGame()
  const { container } = view
  const socket = currentSocket

  assert.ok(choicePanel(container), "전제: 확정 사망 선택이 떠 있어야 한다")
  await act(async () => { findButton(container, "관전 계속하기").click() })
  assert.equal(choicePanel(container), null, "전제: 계속 보기 뒤에는 선택창이 접혀야 한다")

  const topExit = container.querySelector("button[aria-label='게임 나가기']")
  assert.ok(topExit, "전제: 상단 나가기 버튼이 있어야 한다")
  await act(async () => { topExit.click() })
  assert.equal(socket.countEmits("leave_game_session"), 1, "전제: 상단 경로로 요청이 나가야 한다")

  return { container, socket }
}

test("F-23(SPLIT-2): 계속 보기 뒤 상단 나가기가 실패하면 안내와 재시도가 실제로 보이고 눌린다", async () => {
  const { container, socket } = await arriveAtTopExitAfterKeepWatching()

  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  const panel = choicePanel(container)
  assert.ok(panel, "계속 보기 뒤라는 이유로 나가기 실패 안내가 통째로 사라졌다")
  assert.ok(panel.textContent.includes("실패"), "실패 안내 문구가 없다")
  assert.equal(router.state.location.pathname, "/ingame", "실패했는데 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패했는데 인게임 store가 정리됐다")

  const retry = findButton(container, "다시 시도")
  assert.ok(retry, "재시도 수단이 열리지 않았다")
  assert.equal(retry.disabled, false, "재시도 버튼이 비활성이다")
  assert.equal(retry.closest("[inert]"), null, "재시도 버튼이 inert 영역 안에 있다")

  await act(async () => { retry.click() })
  assert.equal(confirmCalls.length, 1, "재시도가 확인 대화상자를 다시 띄웠다")
  assert.equal(socket.countEmits("leave_game_session"), 2)

  const retryAck = socket.takeAck("leave_game_session")
  await act(async () => { retryAck.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, null, "재시도 성공인데 정리되지 않았다")
  assert.equal(useMatchingStore.getState().isInRoom, false)
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-23(SPLIT-2): 계속 보기 뒤 상단 나가기의 ACK가 유실되면 미확정 안내와 결과 확인이 보이고, 권위 확인으로만 정리한다", async () => {
  const { container, socket } = await arriveAtTopExitAfterKeepWatching()

  assert.ok(socket.countEmits("get_session_snapshot") >= 1,
    "전제: 재접속 동기화가 배경에서 이미 한 번 조회한다")
  socket.takeAck("leave_game_session")

  await act(async () => { globalThis.__fireExitTimeouts() })

  const panel = choicePanel(container)
  assert.ok(panel, "계속 보기 뒤라는 이유로 미확정 안내가 사라졌다")
  assert.ok(panel.textContent.includes("확인하지 못했습니다"), "미확정 안내 문구가 없다")
  assert.equal(router.state.location.pathname, "/ingame", "ACK 없음만으로 로비로 이동했다")

  const resolve = findButton(container, "나가기 결과 확인")
  assert.ok(resolve, "결과 확인 수단이 열리지 않았다")
  assert.equal(resolve.closest("[inert]"), null, "결과 확인 버튼이 inert 영역 안에 있다")

  const emitsBeforeCheck = socket.countEmits("get_session_snapshot")
  await act(async () => { resolve.click() })
  assert.equal(socket.countEmits("get_session_snapshot"), emitsBeforeCheck + 1,
    "결과 확인이 새 조회를 보내지 않았다")
  const firstCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { firstCheck.ack({ ok: false, code: "INTERNAL_ERROR" }) })
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "INTERNAL_ERROR를 성공으로 바꿨다")
  assert.equal(router.state.location.pathname, "/ingame")

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const secondCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { secondCheck.ack({ ok: false, code: "FORFEITED_FROM_SESSION" }) })

  assert.equal(useInGameStore.getState().gameId, null, "권위 확인 뒤에도 정리되지 않았다")
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))

  const lateBackground = socket.takeAck("get_session_snapshot")
  if (lateBackground) {
    await act(async () => {
      lateBackground.ack({
        ok: true, gameId: GAME_ID, phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION",
        players: rosterPlayers({ selfAlive: false }).map((p) => ({
          uuid: p.uuid, nickname: p.nickname, isAlive: p.alive, isConnected: true,
        })),
        self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
      })
    })
  }
  assert.equal(useInGameStore.getState().gameId, null, "정리 뒤 도착한 배경 스냅샷이 게임을 되살렸다")
})

test("F-23(AC-06): 나가기 실패 상태에서도 관전 계속하기가 창을 닫고 관전을 이어가며, 재시도 경로는 남는다", async () => {
  const { container, socket } = await arriveAtTopExitAfterKeepWatching()

  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.ok(choicePanel(container), "전제: 실패 안내가 떠 있어야 한다")
  const keepWatching = findButton(container, "관전 계속하기")
  assert.ok(keepWatching, "실패 안내에 관전 계속하기가 없다")
  assert.equal(keepWatching.disabled, false, "실패 상태인데 관전 계속하기가 비활성이다")
  assert.equal(keepWatching.closest("[inert]"), null, "관전 계속하기가 inert 영역 안에 있다")

  await act(async () => { keepWatching.click() })

  assert.equal(choicePanel(container), null, "관전 계속하기를 눌렀는데 창이 닫히지 않았다")
  const topExit = container.querySelector("button[aria-label='게임 나가기']")
  assert.ok(topExit, "상단 나가기 버튼이 사라졌다")
  assert.equal(topExit.closest("[inert]"), null, "창을 닫았는데 게임 표면이 inert로 잠긴 채다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "안내를 접었더니 인게임 store가 정리됐다")
  assert.equal(router.state.location.pathname, "/ingame")
  assert.equal(myMembership(), MY_MEMBERSHIP, "안내를 접는 것이 소속을 바꿨다")

  await act(async () => { topExit.click() })
  assert.equal(socket.countEmits("leave_game_session"), 2, "접은 뒤 상단 나가기가 새 요청을 보내지 못했다")

  const second = socket.takeAck("leave_game_session")
  await act(async () => { second.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  const reopened = choicePanel(container)
  assert.ok(reopened, "새 시도의 실패 안내가 다시 뜨지 않았다(접은 선택이 새 시도까지 덮었다)")
  assert.ok(reopened.textContent.includes("실패"), "새 시도의 실패 문구가 없다")
  assert.ok(findButton(container, "다시 시도"), "새 시도의 복구 버튼이 없다")
})

test("F-23(SPLIT-2): 소속 A→B→A 직후(효과 실행 전) 도착한 옛 성공 ACK는 현재 판을 정리하지 못한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  assert.equal(socket.countEmits("leave_game_session"), 1, "전제: 요청이 나가야 한다")
  const stale = socket.takeAck("leave_game_session")

  await act(async () => {
    swapMyMembership("mem-self-2")
    swapMyMembership(MY_MEMBERSHIP)
    stale.ack({ ok: true })
  })

  assert.equal(myMembership(), MY_MEMBERSHIP, "전제: 소속 값은 원래대로 돌아왔다")
  assert.equal(
    useInGameStore.getState().gameId, GAME_ID,
    "소속 왕복을 지나온 옛 성공 ACK가 지금 참가 중인 판을 정리했다",
  )
  assert.equal(router.state.location.pathname, "/ingame", "옛 ACK로 로비로 이동했다")
})

test("F-23(SPLIT-2): 상한을 넘겨 미확정으로 끝난 시도의 늦은 ACK는 화면을 뒤집지 못한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  const late = socket.takeAck("leave_game_session")

  await act(async () => { globalThis.__fireExitTimeouts() })
  assert.ok(
    choicePanel(container).textContent.includes("확인하지 못했습니다"),
    "전제: 상한을 넘기면 미확정으로 끝맺어야 한다",
  )

  await act(async () => { late.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, GAME_ID, "만료된 시도의 늦은 ACK가 판을 정리했다")
  assert.equal(router.state.location.pathname, "/ingame", "만료된 시도의 늦은 ACK로 로비로 이동했다")
  assert.ok(
    choicePanel(container).textContent.includes("확인하지 못했습니다"),
    "늦은 ACK가 미확정 안내를 덮었다",
  )

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const check = socket.takeAck("get_session_snapshot")
  await act(async () => { check.ack({ ok: false, code: "FORFEITED_FROM_SESSION" }) })

  assert.equal(useInGameStore.getState().gameId, null, "권위 확인 뒤에도 정리되지 않았다")
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-23(SPLIT-1): 재연결 후 재결속이 끝나기 전에는 결과 화면으로 넘어가지 않는다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.id = "sock-2"
    socket.deliver("connect")
  })
  assert.equal(router.state.location.pathname, "/ingame")

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "CITIZEN" },
      deathReveals: [{ victimUuid: OTHER, source: "JOKER" }],
    })
  })

  assert.equal(useInGameStore.getState().state.phase, "ENDED", "전제: 종료가 반영돼야 한다")
  assert.equal(
    router.state.location.pathname, "/ingame",
    "재결속이 끝나기 전에 잔존 ENDED로 결과 화면에 들어갔다",
  )

  const resync = socket.takeAck("get_session_snapshot")
  assert.ok(resync, "재연결이 현재 신원의 스냅샷을 다시 묻지 않았다")
  await act(async () => {
    resync.ack({
      ok: true, gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      winResult: { winner: "CITIZEN" },
      players: rosterPlayers({ selfAlive: true }).map((p) => ({
        uuid: p.uuid, nickname: p.nickname, isAlive: p.uuid === SELF,
        isConnected: true, isParticipating: true, membershipId: p.membershipId,
      })),
      self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    })
  })

  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "재결속이 끝났는데도 결과 이동이 영영 막혔다",
  ))
})

test("F-23(SPLIT-1): 재결속 스냅샷이 실패하면 잔존 ENDED로 결과 화면에 넘어가지 않고, 다음 정상 스냅샷에서 이동이 재개된다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "CITIZEN" },
      deathReveals: [],
    })
    socket.id = "sock-2"
    socket.deliver("connect")
  })
  assert.equal(router.state.location.pathname, "/ingame")

  assert.equal(useInGameStore.getState().state.phase, "ENDED", "전제: 종료가 반영돼야 한다")
  assert.equal(router.state.location.pathname, "/ingame", "전제: 재결속 중에는 넘어가지 않는다")

  const failed = socket.takeAck("get_session_snapshot")
  assert.ok(failed, "전제: 재연결이 현재 신원의 스냅샷을 다시 물어야 한다")
  await act(async () => { failed.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.equal(
    router.state.location.pathname, "/ingame",
    "재결속 스냅샷이 실패했는데 잔존 ENDED로 결과 화면에 들어갔다",
  )
  await act(async () => { await Promise.resolve() })
  assert.equal(router.state.location.pathname, "/ingame", "뒤이은 렌더에서 결과 화면으로 넘어갔다")
  assert.equal(
    useInGameStore.getState().state.winResult ?? null, null,
    "이전 연결의 잔존 종료 결과가 확인 없이 이동 근거로 남았다",
  )
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패가 세션 자체를 지웠다")

  await act(async () => {
    socket.id = "sock-3"
    socket.deliver("connect")
  })
  const recovered = socket.takeAck("get_session_snapshot")
  assert.ok(recovered, "다음 재연결이 현재 신원의 스냅샷을 다시 묻지 않았다")
  await act(async () => {
    recovered.ack({
      ok: true, gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      winResult: { winner: "CITIZEN" },
      players: rosterPlayers({ selfAlive: true }).map((p) => ({
        uuid: p.uuid, nickname: p.nickname, isAlive: p.uuid === SELF,
        isConnected: true, isParticipating: true, membershipId: p.membershipId,
      })),
      self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    })
  })

  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "정상 스냅샷을 받았는데도 결과 이동이 영영 막혔다",
  ))
})

test("F-23(SPLIT-1): 재연결 뒤 현재 연결에서 받은 정상 종료는 재결속 스냅샷이 실패해도 결과 화면으로 이어진다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.id = "sock-2"
    socket.deliver("connect")
  })
  assert.equal(router.state.location.pathname, "/ingame", "전제: 아직 종료가 아니다")
  const pending = socket.takeAck("get_session_snapshot")
  assert.ok(pending, "전제: 재연결이 현재 신원의 스냅샷을 다시 물어야 한다")

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: true }],
      victimUuid: null,
      winResult: { winner: "CITIZEN" },
      deathReveals: [],
    })
  })
  assert.equal(
    useInGameStore.getState().state.phase, "ENDED",
    "전제: 이 연결의 정상 공개 종료가 실제로 반영돼야 한다",
  )
  assert.equal(
    router.state.location.pathname, "/ingame",
    "전제: 재결속이 끝나기 전에는 아직 기다린다",
  )

  await act(async () => { pending.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.ok(
    useInGameStore.getState().state.winResult,
    "현재 연결에서 직접 받은 정상 종료 결과가 스냅샷 실패로 지워졌다",
  )
  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "현재 연결이 받은 정상 종료인데도 결과 화면으로 넘어가지 못했다",
  ))
})

test("F-23(SPLIT-1): 인증 A→B→A 왕복 뒤 스냅샷이 실패하면 이전 계정의 종료 결과로 결과 화면에 넘어가지 않는다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "CITIZEN" },
      deathReveals: [{ victimUuid: OTHER, source: "JOKER" }],
    })
    useAuthStore.setState((s) => ({
      user: { uuid: OTHER }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
    useAuthStore.setState((s) => ({
      user: { uuid: SELF, nickname: "나" }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
  })
  assert.equal(useInGameStore.getState().state.phase, "ENDED", "전제: 종료가 반영돼야 한다")
  assert.equal(router.state.location.pathname, "/ingame", "전제: 확인 전에는 넘어가지 않는다")

  assert.equal(myMembership(), MY_MEMBERSHIP, "전제: 소속은 그대로다")
  assert.equal(socket.id, "sock-1", "전제: 연결은 교체되지 않는다")
  assert.equal(
    router.state.location.pathname, "/ingame",
    "인증 왕복 직후의 렌더에서 이전 계정의 종료 결과로 결과 화면에 들어갔다",
  )

  const failed = socket.takeAck("get_session_snapshot")
  assert.ok(failed, "전제: 인증 왕복이 현재 신원의 스냅샷을 다시 물어야 한다")
  await act(async () => { failed.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.equal(
    router.state.location.pathname, "/ingame",
    "인증이 왕복하고 스냅샷도 실패했는데 이전 계정의 종료 결과로 결과 화면에 들어갔다",
  )
  await act(async () => { await Promise.resolve() })
  assert.equal(router.state.location.pathname, "/ingame", "뒤이은 렌더에서 결과 화면으로 넘어갔다")
  assert.equal(
    useInGameStore.getState().state.winResult, null,
    "확인하지 못한 이전 계정의 종료 결과가 이동 근거로 그대로 남았다",
  )
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패가 세션 자체를 지웠다")

  await act(async () => {
    socket.id = "sock-2"
    socket.deliver("connect")
  })
  const recovered = socket.takeAck("get_session_snapshot")
  assert.ok(recovered, "다음 재연결이 현재 신원의 스냅샷을 다시 묻지 않았다")
  await act(async () => {
    recovered.ack({
      ok: true, gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      winResult: { winner: "CITIZEN" },
      players: rosterPlayers({ selfAlive: true }).map((p) => ({
        uuid: p.uuid, nickname: p.nickname, isAlive: p.uuid === SELF,
        isConnected: true, isParticipating: true, membershipId: p.membershipId,
      })),
      self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    })
  })

  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "정상 스냅샷을 받았는데도 결과 이동이 영영 막혔다",
  ))
})

test("F-23(SPLIT-2): 계정이 왕복한 뒤에는 이전 신원의 계속 보기 선택이 새 신원에 적용되지 않는다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()

  await act(async () => { findButton(container, "관전 계속하기").click() })
  assert.equal(choicePanel(container), null, "전제: 선택이 실제로 접혀야 한다")

  await act(async () => {
    useAuthStore.setState((s) => ({
      user: { uuid: OTHER }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
    useAuthStore.setState((s) => ({
      user: { uuid: SELF, nickname: "나" }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
  })

  assert.ok(
    choicePanel(container),
    "계정이 왕복한 뒤에도 이전 신원의 선택이 그대로 적용돼 새 신원이 선택을 받지 못했다",
  )
  assert.ok(findButton(container, "게임 나가기"), "새 신원의 선택지가 없다")
})

test("F-23(AC-06): 계정이 바뀐 뒤 도착한 옛 ACK는 새 화면을 바꾸지 않는다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  const stale = socket.takeAck("leave_game_session")

  await act(async () => {
    useAuthStore.setState((s) => ({
      user: { uuid: OTHER }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
    useAuthStore.setState((s) => ({
      user: { uuid: SELF, nickname: "나" }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
  })

  await act(async () => { stale.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, GAME_ID, "A→B→A를 지나온 옛 ACK가 현재 판을 정리했다")
  assert.equal(router.state.location.pathname, "/ingame")
})
