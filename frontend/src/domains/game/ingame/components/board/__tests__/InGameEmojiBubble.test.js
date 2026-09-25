import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act, createElement } from "react"
import { register } from "node:module"
import { JSDOM } from "jsdom"

/**
 * E-3(F-33 AC-04): emoji_shown 수신 → 해당 uuid 카드 위 말풍선 → 3초 뒤 소멸 → 재수신 시 교체를
 * **실제 수신 경로**로 검증한다(useGameSessionSocketEvents → inGameEmojiBubble.store →
 * InGamePlayerBoard → InGameEmojiBubble).
 *
 * 대역은 바깥 경계뿐이다 — 소켓, 라우터 이동, 효과음, 자산 픽커, 팔레트 HTTP. 수신 가드
 * (등록 범위 · 현재 gameId 일치)와 3초 타이머는 프로덕션 코드 그대로 돈다.
 *
 * 시간은 시험이 소유한다. 다만 **말풍선 만료 지연만** 가로채고(delay === 3000) 나머지 짧은
 * 지연은 실제 타이머로 둔다 — React·testing-library의 내부 스케줄링까지 얼리면 렌더 커밋 자체가
 * 멈춘다(InGamePage.deadParticipant.integration.test.js의 나가기 상한 가로채기와 같은 관례).
 */
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
installDomGlobal("MouseEvent", dom.window.MouseEvent)
installDomGlobal("KeyboardEvent", dom.window.KeyboardEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `portrait-${index}` },
})
mock.module("../../../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGameJobPortrait: (index) => `portrait-${index}`,
    pickInGamePlayerFrame: (index) => `frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc) => frameSrc,
    resolveAccountCardFrameSrc: () => null,
  },
})
mock.module("../../../../../../shared/hooks/useSfxRuntime.js", {
  namedExports: {
    dispatchSfxEvent: () => {},
    dispatchUiSfx: () => {},
    useSfxRuntime: () => {},
    getSfxMix: () => ({ gain: 0, muted: true }),
    subscribeSfxMix: () => () => {},
  },
})
mock.module("../../../../../user/api/emojiPalette.api.js", {
  namedExports: {
    getEmojiPaletteApi: async () => ({ ok: true, slots: GAME_SLOTS, revision: "rev-1", owned: OWNED }),
    saveEmojiPaletteApi: async ({ slots }) => ({ ok: true, slots, revision: "rev-2" }),
  },
})

const { render, cleanup } = await import("@testing-library/react")
// useGameSessionSocketEvents는 useNavigate를 쓴다 — 훅을 대역하지 않고 실제 라우터 컨텍스트를
// 씌운다(이동 자체는 이 파일의 관심사가 아니지만, 대역으로 바꾸면 훅이 실제 코드가 아니게 된다).
const { MemoryRouter } = await import("react-router-dom")
const { useAuthStore } = await import("../../../../../auth/store/auth.store.js")
const { useInGameStore } = await import("../../../store/ingameStore.js")
const { useInGameEmojiBubbleStore, INGAME_EMOJI_BUBBLE_DURATION_MS } = await import(
  "../../../store/inGameEmojiBubble.store.js")
const { useEmojiPaletteStore } = await import("../../../../../user/store/emojiPalette.store.js")
const { setSocket } = await import("../../../../../../shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../../hooks/useGameSessionSocketEvents.js")
const { InGameActionProvider } = await import("../../../pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../InGamePlayerSessionProvider.jsx")
const { default: InGamePlayerBoard } = await import("../InGamePlayerBoard.jsx")
const { INGAME_EMOJI_BUBBLE_ATTR } = await import("../InGameEmojiBubble.jsx")
const { INGAME_E2E_ATTRS } = await import("../../../constants/e2e/ingameE2eHooks.js")

const SELF = "uuid-self"
const OTHER = "uuid-other"
const HELLO = "emoji-basic-hello"
const LOVE = "emoji-basic-love"
const OWNED = [HELLO, LOVE]
const GAME_SLOTS = [HELLO, LOVE, null, null, null, null, null, null]

// ── 말풍선 만료 지연만 시험이 소유하는 가상 시계 ────────────────────────────
const nativeSetTimeout = globalThis.setTimeout
const nativeClearTimeout = globalThis.clearTimeout
let virtualNow = 0
let bubbleTimerSeq = 0
const bubbleTimers = new Map()

installDomGlobal("setTimeout", (fn, delay, ...rest) => {
  if (delay === INGAME_EMOJI_BUBBLE_DURATION_MS) {
    bubbleTimerSeq += 1
    const id = `bubble-timer-${bubbleTimerSeq}`
    bubbleTimers.set(id, { fn, fireAt: virtualNow + delay })
    return id
  }
  return nativeSetTimeout(fn, delay, ...rest)
})
installDomGlobal("clearTimeout", (id) => {
  if (typeof id === "string" && bubbleTimers.has(id)) {
    bubbleTimers.delete(id)
    return undefined
  }
  return nativeClearTimeout(id)
})

/** 가상 시각을 ms만큼 흘리고, 그 사이에 만료된 말풍선 타이머를 실제로 깨운다. */
function advance(ms) {
  virtualNow += ms
  const due = [...bubbleTimers.entries()].filter(([, timer]) => timer.fireAt <= virtualNow)
  act(() => {
    for (const [id, timer] of due) {
      bubbleTimers.delete(id)
      timer.fn()
    }
  })
}

function createFakeSocket({ id = "sock-1" } = {}) {
  const listeners = new Map()
  return {
    id,
    connected: true,
    listeners,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    emit() {},
    emitWithAck: async () => ({ ok: true, sentAt: 1 }),
    /** 서버가 보낸 것처럼 이 연결의 구독자를 부른다. */
    deliver(event, payload) {
      act(() => {
        for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
      })
    },
    countSubscriptions(event) {
      return listeners.get(event)?.size ?? 0
    },
  }
}

function roster() {
  return [
    { uuid: SELF, nickname: "본인", alive: true, isParticipating: true, membershipId: "mem-self", themeIndex: 0 },
    { uuid: OTHER, nickname: "상대", alive: true, isParticipating: true, membershipId: "mem-other", themeIndex: 1 },
  ]
}

function gameState(gameId = "game-1") {
  return {
    id: gameId,
    phase: "DAY",
    dayPhase: "DAY_DISCUSSION",
    dayIndex: 1,
    hostUuid: OTHER,
    roomId: "room-1",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    participationRevision: 0,
    players: roster(),
    self: { uuid: SELF, nickname: "본인", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
  }
}

/** 실제 수신 훅과 실제 보드를 같은 트리에 둔다(둘을 잇는 store가 대역이 아니라 프로덕션이다). */
function Harness() {
  useGameSessionSocketEvents()
  return createElement(
    InGamePlayerSessionProvider,
    null,
    createElement(InGameActionProvider, { interactionBlocked: false }, createElement(InGamePlayerBoard)),
  )
}

function setUp({ gameId = "game-1" } = {}) {
  const socket = createFakeSocket()
  act(() => {
    useInGameStore.getState().clearGame()
    useInGameEmojiBubbleStore.getState().clearAllActiveEmoji()
    useEmojiPaletteStore.getState().reset()
    useAuthStore.setState({ user: { uuid: SELF }, isLoggedIn: true })
    useInGameStore.getState().setGamePayload({ gameId, state: gameState(gameId) })
  })
  setSocket(socket)
  let view
  act(() => { view = render(createElement(MemoryRouter, null, createElement(Harness))) })
  return { socket, view }
}

async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve() })
  }
}

function bubbleOn(container, nickname) {
  const card = container.querySelector(`[${INGAME_E2E_ATTRS.playerNickname}="${nickname}"]`)
  assert.ok(card, `${nickname} 카드를 실제 보드에서 찾지 못했다`)
  return card.closest('[role="button"]').querySelector(`[${INGAME_EMOJI_BUBBLE_ATTR}]`)
}

function activeEmojiFor(uuid) {
  return useInGameEmojiBubbleStore.getState().byUuid[uuid] ?? null
}

test.afterEach(() => {
  cleanup()
  act(() => {
    useInGameEmojiBubbleStore.getState().clearAllActiveEmoji()
    useInGameStore.getState().clearGame()
    useEmojiPaletteStore.getState().reset()
    useAuthStore.setState({ user: null, isLoggedIn: false })
  })
  setSocket(null)
  bubbleTimers.clear()
  virtualNow = 0
})

test("AC-04: emoji_shown을 받으면 그 uuid 카드 위에 말풍선이 뜨고 3초 뒤 사라진다", async () => {
  const { socket, view } = setUp()
  await settle()
  assert.equal(socket.countSubscriptions("emoji_shown"), 1, "emoji_shown 구독이 등록되지 않았다")

  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: HELLO, sentAt: 1_000 })

  assert.equal(activeEmojiFor(OTHER)?.itemId, HELLO, "store에 활성 이모티콘이 들어가지 않았다")
  assert.equal(bubbleOn(view.container, "상대")?.getAttribute(INGAME_EMOJI_BUBBLE_ATTR), HELLO,
    "보낸 사람 카드 위에 말풍선이 뜨지 않았다")
  assert.equal(bubbleOn(view.container, "본인"), null, "다른 카드에도 말풍선이 붙었다")

  // 3초가 되기 전에는 그대로 있다.
  advance(INGAME_EMOJI_BUBBLE_DURATION_MS - 1)
  assert.ok(bubbleOn(view.container, "상대"), "3초가 되기 전에 말풍선이 사라졌다")

  advance(1)
  assert.equal(activeEmojiFor(OTHER), null, "3초 뒤에도 store에 항목이 남았다")
  assert.equal(bubbleOn(view.container, "상대"), null, "3초 뒤에도 말풍선이 화면에 남았다")
})

test("AC-04: 2초 시점의 재수신은 말풍선을 교체하고, 그 시점부터 다시 3초가 온전히 흐른다", async () => {
  const { socket, view } = setUp()
  await settle()

  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: HELLO, sentAt: 1_000 })
  advance(2_000)
  assert.equal(bubbleOn(view.container, "상대").getAttribute(INGAME_EMOJI_BUBBLE_ATTR), HELLO)

  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: LOVE, sentAt: 3_000 })
  assert.equal(bubbleOn(view.container, "상대").getAttribute(INGAME_EMOJI_BUBBLE_ATTR), LOVE,
    "재수신이 말풍선을 교체하지 않았다")

  // 앞의 타이머가 살아 있었다면 여기서(첫 수신 기준 3초) 사라졌을 것이다.
  advance(1_000)
  assert.equal(bubbleOn(view.container, "상대")?.getAttribute(INGAME_EMOJI_BUBBLE_ATTR), LOVE,
    "교체 전 타이머가 취소되지 않아 새 말풍선이 일찍 사라졌다")

  advance(INGAME_EMOJI_BUBBLE_DURATION_MS - 1_000)
  assert.equal(activeEmojiFor(OTHER), null, "교체 시점부터 다시 센 3초가 지났는데 사라지지 않았다")
  assert.equal(bubbleOn(view.container, "상대"), null)
})

test("AC-04: 여러 참가자의 말풍선은 서로 독립적으로 뜨고 사라진다", async () => {
  const { socket, view } = setUp()
  await settle()

  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: HELLO, sentAt: 1_000 })
  advance(2_000)
  socket.deliver("emoji_shown", { gameId: "game-1", uuid: SELF, itemId: LOVE, sentAt: 3_000 })

  assert.ok(bubbleOn(view.container, "상대"))
  assert.ok(bubbleOn(view.container, "본인"))

  advance(1_000) // 상대만 3초 도달
  assert.equal(bubbleOn(view.container, "상대"), null, "먼저 받은 쪽이 3초에 사라지지 않았다")
  assert.ok(bubbleOn(view.container, "본인"), "나중에 받은 쪽이 함께 지워졌다")
})

test("AC-04: 재접속(connect)은 남아 있던 말풍선을 즉시 전부 비운다", async () => {
  const { socket, view } = setUp()
  await settle()

  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: HELLO, sentAt: 1_000 })
  socket.deliver("emoji_shown", { gameId: "game-1", uuid: SELF, itemId: LOVE, sentAt: 1_000 })
  assert.equal(Object.keys(useInGameEmojiBubbleStore.getState().byUuid).length, 2)

  socket.deliver("connect", undefined)

  assert.deepEqual(useInGameEmojiBubbleStore.getState().byUuid, {},
    "재접속 뒤에도 이전 연결의 말풍선이 남았다")
  assert.equal(bubbleOn(view.container, "상대"), null)
  assert.equal(bubbleOn(view.container, "본인"), null)
  // 타이머까지 걷어냈으므로, 만료 시각이 지나도 다시 아무 일이 일어나지 않는다.
  advance(INGAME_EMOJI_BUBBLE_DURATION_MS)
  assert.deepEqual(useInGameEmojiBubbleStore.getState().byUuid, {})
})

// ── AC-04: 수신 가드 ────────────────────────────────────────────────────────

test("AC-04: payload.gameId가 현재 판과 다르면 표시하지 않는다(이전 판의 늦은 방송)", async () => {
  const { socket, view } = setUp()
  await settle()

  socket.deliver("emoji_shown", { gameId: "game-old", uuid: OTHER, itemId: HELLO, sentAt: 1_000 })

  assert.equal(activeEmojiFor(OTHER), null, "이전 판의 방송이 현재 화면에 표시됐다")
  assert.equal(bubbleOn(view.container, "상대"), null)

  // 현재 판의 방송은 같은 경로로 정상 표시된다 — 가드가 전부를 막아서 통과하는 것이 아님을 고정한다.
  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: HELLO, sentAt: 2_000 })
  assert.equal(activeEmojiFor(OTHER)?.itemId, HELLO)
})

test("AC-04: 현재 판이 없으면(clearGame) 어떤 emoji_shown도 표시하지 않는다", async () => {
  const { socket } = setUp()
  await settle()

  act(() => { useInGameStore.getState().clearGame() })
  await settle()
  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: HELLO, sentAt: 1_000 })

  assert.deepEqual(useInGameEmojiBubbleStore.getState().byUuid, {},
    "판이 없는데 말풍선 상태가 만들어졌다")
})

test("AC-04: 등록 범위가 지나간 구독(소켓 id 변경)이 받은 방송은 버린다", async () => {
  const { socket } = setUp()
  await settle()

  // 같은 소켓 객체의 재연결은 id만 바꾼다 — 등록 시점 문맥은 옛 id를 들고 있다.
  socket.id = "sock-reconnected"
  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: HELLO, sentAt: 1_000 })

  assert.deepEqual(useInGameEmojiBubbleStore.getState().byUuid, {},
    "등록 범위가 지나간 구독이 받은 방송이 현재 화면에 실렸다")
})

test("AC-04: 형식이 어긋난 payload는 전부 버린다", async () => {
  const { socket } = setUp()
  await settle()

  for (const payload of [
    null, undefined, "emoji", [],
    { gameId: "game-1", uuid: OTHER },
    { gameId: "game-1", uuid: OTHER, itemId: "" },
    { gameId: "game-1", uuid: "", itemId: HELLO },
    { uuid: OTHER, itemId: HELLO },
  ]) {
    socket.deliver("emoji_shown", payload)
    assert.deepEqual(useInGameEmojiBubbleStore.getState().byUuid, {},
      `형식이 어긋난 payload가 통과했다: ${JSON.stringify(payload)}`)
  }
})

test("AC-04: 카탈로그에 없는 itemId는 말풍선을 그리지 않는다(원시 문자열을 노출하지 않는다)", async () => {
  const { socket, view } = setUp()
  await settle()

  socket.deliver("emoji_shown", { gameId: "game-1", uuid: OTHER, itemId: "emoji-unknown-xyz", sentAt: 1_000 })

  // store는 서버가 말한 사실을 그대로 담되, 화면은 카탈로그에 없는 것을 그리지 않는다.
  assert.equal(activeEmojiFor(OTHER)?.itemId, "emoji-unknown-xyz")
  assert.equal(bubbleOn(view.container, "상대"), null, "카탈로그에 없는 id가 화면에 그려졌다")
  assert.equal(view.container.textContent.includes("emoji-unknown-xyz"), false,
    "서버가 보낸 원시 itemId가 DOM 텍스트로 새어 나왔다")
})

test("AC-04: 언마운트하면 emoji_shown 구독이 남지 않는다", async () => {
  const { socket, view } = setUp()
  await settle()
  assert.equal(socket.countSubscriptions("emoji_shown"), 1)

  act(() => { view.unmount() })
  assert.equal(socket.countSubscriptions("emoji_shown"), 0, "언마운트 뒤에도 구독이 남았다")
})
