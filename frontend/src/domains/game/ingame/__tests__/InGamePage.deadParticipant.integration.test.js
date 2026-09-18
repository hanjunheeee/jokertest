/**
 * F-23(AC-06): 확정 사망한 참가자의 "관전 계속하기 / 게임 나가기"를 **실제 화면 경로**로 검증한다.
 *
 * 실제로 쓰는 것: app/routes의 실제 router(→ ProtectedRoute → InGamePage), 실제 useInGameExit,
 * 실제 ingameStore/matchingStore/auth store, 실제 useGameSessionSocketEvents 수신 경로.
 * 대역으로 바꾸는 것은 **바깥 경계뿐**이다 — 소켓 전송, HTTP, 효과음, 자산 선택. 페이지나
 * 훅 자체를 성공 대역으로 바꾸지 않는다(그러면 "화면이 동작한다"가 대역의 사실이 된다).
 */
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
// 공용 Scrollbar(useScrollbarThumb)가 요구한다 — 이 시험이 보는 것은 치수가 아니다.
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

// ── 나가기 확인 대화상자 ─────────────────────────────────────────────────────
//
// useInGameExit은 호출 시점에 **window.confirm**을 읽는다(bare confirm이 아니다) — jsdom의
// 기본 구현은 "not implemented"라 undefined를 돌려주고, 그러면 모든 나가기가 조용히
// 취소된다. 그래서 globalThis와 dom.window 양쪽에 같은 함수를 심는다.
let confirmAnswer = true
const confirmCalls = []
const recordConfirm = (message) => {
  confirmCalls.push(message)
  return confirmAnswer
}
installDomGlobal("confirm", recordConfirm)
dom.window.confirm = recordConfirm

// ── 나가기 ACK timeout ───────────────────────────────────────────────────────
// 실제 8초를 기다리지 않고 timeout 경로를 결정적으로 돌기 위해 window.setTimeout만 가로챈다.
// 판정 로직은 프로덕션 그대로다(시간만 시험이 흘려 준다).
const scheduledTimeouts = []
const nativeSetTimeout = dom.window.setTimeout.bind(dom.window)
const nativeClearTimeout = dom.window.clearTimeout.bind(dom.window)
installDomGlobal("__fireExitTimeouts", () => {
  const due = scheduledTimeouts.splice(0, scheduledTimeouts.length)
  for (const entry of due) if (!entry.cancelled) entry.fn()
})
dom.window.setTimeout = (fn, delay, ...rest) => {
  // 나가기 상한(8초)만 시험이 소유한다 — 애니메이션 등 짧은 지연은 실제 타이머로 둔다.
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

register(new URL("./testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// ── 바깥 경계 대역 ───────────────────────────────────────────────────────────
mock.module("../utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `dummy-portrait-${index}` },
})
mock.module("../utils/pickInGamePlayerFrame.js", {
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
  },
})
// import.meta.env는 Vite 빌드타임 치환이라 plain Node에서 해석되지 않는다 — 경계 모듈
// 하나만 갈아끼우고 나머지 라우터·페이지·가드는 전부 실제 코드로 돌린다(f18PodiumRoute와 같은 관례).
mock.module("../../../../shared/env.js", {
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

/**
 * 소켓 전송만 흉내낸다. emit 기록과 ack 응답 시점을 시험이 통제하고, 서버가 보낸 사건은
 * 실제 프런트 리스너(useGameSessionSocketEvents 등)로 그대로 흘려보낸다.
 */
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
    /**
     * 가장 **최근에** 나간 그 이벤트의 ack를 꺼낸다.
     *
     * 뒤에서부터 찾는 것이 중요하다 — /ingame에는 재접속 동기화
     * (useInGameSessionSnapshotSync)가 마운트 시점에 이미 get_session_snapshot 하나를
     * 띄워 둔다. 앞에서부터 찾으면 시험이 방금 누른 버튼의 요청이 아니라 그 배경 요청에
     * 응답하게 되어, 실제로는 아무 답도 받지 못한 화면을 검사하게 된다.
     */
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
const { router } = await import("../../../../app/routes/index.jsx")
// SPLIT-1(AC-02): 라우트 선언에서 "인증 보호 구간"을 식별하려면 그 가드 컴포넌트 자체가
// 필요하다 — 문자열이 아니라 실제 element 타입으로 대조한다.
const { default: ProtectedRoute } = await import("../../../../shared/ui/ProtectedRoute.jsx")
const { useInGameStore } = await import("../store/ingameStore.js")
const { useMatchingStore } = await import("../../matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")

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
  // 실제 진입 흐름과 같다: 자기 역할 공개(및 뒤이은 DAY/NIGHT 진입 연출)를 사용자가 확인해
  // 닫는다. 이 연출들이 떠 있는 동안에는 사망 선택이 뜨지 않는 것이 설계이므로, 시험도
  // 그 순서를 건너뛰지 않고 실제로 닫는다.
  await dismissParchmentOverlays(view.container)
  return view
}

function findButton(container, label) {
  return [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label) ?? null
}

/** 화면에 떠 있는 양피지 모달(역할 공개·진입 연출)의 "확인"을 차례로 눌러 닫는다. */
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

test.afterEach(async () => {
  cleanup()
  await act(async () => { await router.navigate("/lobby") })
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
})

/**
 * F-23(SPLIT-1/AC-02): **외부 관전 진입 라우트가 없다**는 사실을 실제 라우터 선언에서 본다.
 *
 * 화면 문자열만 검사하면 "그 버튼이 지금 렌더되지 않는다"까지만 알 수 있고, 주소를 직접 쳐서
 * 들어가는 경로가 남아 있어도 통과한다. 여기서는 실제 router 객체의 선언된 경로를 전부 펼쳐
 * 관전 전용 경로가 없음을 고정하고, 동시에 정상 참가 화면 세 개는 보호 라우트 **아래에**
 * 그대로 남아 있는지 함께 본다(제거가 정상 진입까지 지우지 않았다).
 */
test("F-23(SPLIT-1/AC-02): 실제 라우터에 외부 관전 경로가 없고 정상 참가 경로는 보호 아래 그대로다", () => {
  const collectPaths = (routes, guarded = false) => routes.flatMap((route) => {
    // ProtectedRoute를 element로 갖는 레이아웃 라우트 아래가 곧 "인증 보호 구간"이다.
    const isGuard = route.element?.type === ProtectedRoute
    const here = route.path ? [{ path: route.path, guarded }] : []
    return [...here, ...collectPaths(route.children ?? [], guarded || isGuard)]
  })

  const declared = collectPaths(router.routes)
  assert.ok(declared.length > 0, "라우터에서 경로를 하나도 읽지 못했다(이 검사가 무력하다)")

  // 관전 전용 진입 경로가 하나도 없다.
  const spectatorRoutes = declared.filter(({ path }) => /spectat|watch-only|observer|관전/i.test(path))
  assert.deepEqual(spectatorRoutes, [], `외부 관전 라우트가 남아 있다: ${JSON.stringify(spectatorRoutes)}`)

  // 정상 참가 화면은 보호 라우트 아래에 그대로 선언돼 있다.
  for (const path of ["/game-setup", "/game-matching", "/ingame"]) {
    const found = declared.find((route) => route.path === path)
    assert.ok(found, `${path} 경로가 사라졌다`)
    assert.equal(found.guarded, true, `${path}가 인증 보호 밖으로 나왔다`)
  }
})

test("F-23(AC-06): 생존 중인 참가자에게는 사망 선택이 보이지 않는다", async () => {
  seedLiveGame({ selfAlive: true })
  const { container } = await mountInGame()

  assert.equal(choicePanel(container), null, "생존자에게 사망 선택이 떴다")
  assert.equal(container.textContent.includes("관전 계속하기"), false)
})

test("F-23(AC-06): 실제 밤 판정 사건으로 확정 사망하면 두 선택이 뜨고, 계속 보기는 서버 요청 0회다", async () => {
  // 밤에서 시작해 실제 밤 판정 방송으로 낮에 들어가며 사망이 확정되는 정상 순서를 쓴다.
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 0 })
  const { container } = await mountInGame()
  const socket = currentSocket

  // 실제 수신 경로(useGameSessionSocketEvents → parseNightResultAppliedPayload → store)로
  // canonical 사망을 확정한다. deathReveals는 비운다 — 이 시험의 대상은 연출이 아니라 선택창이다.
  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "DAY", dayIndex: 1,
      players: [{ uuid: SELF, alive: false }, { uuid: OTHER, alive: true }],
      victimUuid: SELF,
      deathReveals: [],
    })
  })
  // 낮 진입 연출이 새로 뜬다 — 실제 사용자가 그러듯 확인해 닫은 뒤에 선택을 받는다.
  await dismissParchmentOverlays(container)

  assert.equal(
    useInGameStore.getState().state.players.find((p) => p.uuid === SELF).alive, false,
    "전제: 서버 사건으로 본인이 확정 사망해야 한다",
  )
  assert.ok(choicePanel(container), "확정 사망인데 선택이 뜨지 않았다")
  assert.ok(findButton(container, "관전 계속하기"), "관전 계속하기 버튼이 없다")
  assert.ok(findButton(container, "게임 나가기"), "게임 나가기 버튼이 없다")

  // 계속 보기: 네트워크 요청 0, 소속·참여 자격·역할 그대로, 선택창만 접힌다.
  const emitsBefore = socket.emitted.length
  const roleBefore = useInGameStore.getState().state.self.role
  await act(async () => { findButton(container, "관전 계속하기").click() })

  assert.equal(socket.emitted.length, emitsBefore, "계속 보기가 서버 요청을 만들었다")
  assert.equal(choicePanel(container), null, "계속 보기 뒤에도 선택창이 남아 있다")
  const seated = useInGameStore.getState().state.players.find((p) => p.uuid === SELF)
  assert.equal(seated.membershipId, MY_MEMBERSHIP, "계속 보기로 소속이 바뀌었다")
  assert.equal(seated.isParticipating, true, "계속 보기로 참여 자격이 바뀌었다")
  // 계속 보기는 **로컬 선택**이다 — 역할이 관전자 같은 다른 값으로 바뀌면 안 된다.
  assert.equal(useInGameStore.getState().state.self.role, roleBefore, "계속 보기가 역할을 바꿨다")
  assert.equal(useInGameStore.getState().state.self.uuid, SELF, "계속 보기가 신원을 바꿨다")

  // 전제: 지금은 토론 구간이고, 그 구간의 화면만 떠 있다.
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_DISCUSSION")
  assert.ok(findButton(container, "투표 시작 준비"), "전제: 토론 구간 화면이어야 한다")
  assert.equal(container.textContent.includes("투표 대상 선택"), false)

  // 계속 보기 뒤에도 공개 진행은 계속 들어오고 화면이 실제로 갱신된다.
  //
  // "선택창이 다시 뜨지 않는다"만으로는 갱신을 증명하지 못한다 — 사건을 통째로 무시해도 그
  // 단언은 통과한다. 그래서 store의 낮 하위 구간과 **그 구간에서만 그려지는 DOM**을 함께 본다.
  await act(async () => {
    // 실제 서버가 보내는 그대로다(game-core/gameSession.js::buildDayPhaseChangedPayload):
    // gameId·dayIndex·dayPhase·round 네 필드뿐이고, round는 파서가 요구하는 필수 값이다
    // (빠지면 parseDayPhaseChangedPayload가 null을 돌려줘 이 사건이 통째로 무시된다).
    socket.deliver("day_phase_changed", {
      gameId: GAME_ID, dayIndex: 1, dayPhase: "DAY_VOTE", round: 1,
    })
  })
  assert.equal(choicePanel(container), null, "공개 사건이 접힌 선택창을 되살렸다")
  assert.equal(
    useInGameStore.getState().state.dayPhase, "DAY_VOTE",
    "공개 진행 사건이 store의 낮 구간을 갱신하지 않았다",
  )
  await waitFor(() => assert.equal(
    container.textContent.includes("투표 대상 선택"), true,
    "공개 진행 사건이 화면에 반영되지 않았다",
  ))
  assert.equal(findButton(container, "투표 시작 준비"), null, "이전 구간 화면이 그대로 남아 있다")

  // 그리고 상단 나가기 수단은 그대로 남아 있다.
  assert.ok(container.querySelector("button[aria-label='게임 나가기']"), "상단 나가기 버튼이 사라졌다")
})

test("F-23(AC-06): 나가기 성공 ACK는 정확히 한 번 정리하고 로비로 replace 이동한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  assert.ok(choicePanel(container), "전제: 확정 사망 선택이 떠 있어야 한다")

  await act(async () => { findButton(container, "게임 나가기").click() })
  assert.equal(confirmCalls.length, 1, "확인 대화상자가 한 번 떠야 한다")
  assert.equal(socket.countEmits("leave_game_session"), 1)

  // pending 동안의 추가 클릭은 확인조차 다시 묻지 않고 전송도 0이다.
  await act(async () => { container.querySelector("button[aria-label='게임 나가기']").click() })
  assert.equal(confirmCalls.length, 1, "pending 중에 확인 대화상자가 다시 떴다")
  assert.equal(socket.countEmits("leave_game_session"), 1, "pending 중 중복 전송이 일어났다")

  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, null, "성공 ACK인데 인게임 store가 정리되지 않았다")
  assert.equal(useMatchingStore.getState().isInRoom, false)
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))

  // 뒤늦은 중복 ACK는 아무 일도 하지 않는다(정리·이동은 이미 한 번 끝났다).
  await act(async () => { pending.ack({ ok: true }) })
  assert.equal(router.state.location.pathname, "/multiplay")
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

  // 명시적 재시도는 확인을 다시 묻지 않고 같은 요청을 한 번 더 보낸다.
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
  socket.takeAck("leave_game_session") // 영영 응답하지 않는다.

  // 유한 상한이 지난다 — 성공으로도 실패로도 단정하지 않는다.
  await act(async () => { globalThis.__fireExitTimeouts() })

  assert.equal(router.state.location.pathname, "/ingame", "ACK 없음만으로 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.ok(choicePanel(container).textContent.includes("확인하지 못했습니다"), "미확정 안내가 없다")

  // 권위 확인 1: 전송 오류·SESSION_NOT_FOUND는 성공 근거가 아니다.
  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const firstCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { firstCheck.ack({ ok: false, code: "SESSION_NOT_FOUND" }) })
  assert.equal(router.state.location.pathname, "/ingame", "SESSION_NOT_FOUND를 성공으로 바꿨다")

  // 권위 확인 2: 이 판에서 이미 빠졌다는 서버의 답만이 정리 근거다.
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

test("F-23(AC-06): 계정이 바뀐 뒤 도착한 옛 ACK는 새 화면을 바꾸지 않는다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  const stale = socket.takeAck("leave_game_session")

  // A→B→A. 계정 값은 원래대로 돌아오지만 전이 세대는 두 번 올랐다.
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
