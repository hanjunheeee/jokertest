import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act, createElement, StrictMode } from "react"
import { register } from "node:module"
import { JSDOM } from "jsdom"

/**
 * E-3(F-33 AC-03): 본인 카드 우클릭 → 8칸 팔레트 → 칸 선택 → send_emoji 를 **실제 생산 트리**로
 * 검증한다(InGamePlayerSessionProvider > InGameActionProvider > InGamePlayerBoard).
 *
 * 대역은 바깥 경계뿐이다 — 소켓, 팔레트 HTTP 조회, 자산 픽커. 보드·팔레트·전송 훅·
 * emojiPalette.store·ingameStore·auth store는 전부 프로덕션 코드 그대로 돈다.
 *
 * 이 파일이 답하는 질문 세 갈래:
 *   (1) 우클릭이 **본인 카드에서만** 팔레트를 열고, 칸 선택이 좌클릭 카드 메뉴로 새지 않는가.
 *   (2) 한 제스처(좌클릭 · 우클릭 놓기)당 send_emoji가 **정확히 한 번**인가.
 *   (3) 팔레트 데이터의 수명 — StrictMode 이중 effect·같은 판 재마운트에서 GET이 1회뿐이고,
 *       연결이 없거나 ACK가 거부돼도 처리되지 않은 rejection 없이 로컬 실패로 해결되는가.
 */
// url이 반드시 있어야 한다 — auth.store는 persist(localStorage)를 쓰는 실제 store이고,
// opaque origin(about:blank)에서는 jsdom이 localStorage 접근 자체를 SecurityError로 막는다.
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

// 자산 픽커는 vite alias로 PNG를 끌어온다 — 바깥 경계라 Node에서 그것만 대역한다.
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

// ── 팔레트 HTTP 경계 ─────────────────────────────────────────────────────────
//
// 조회 **횟수**가 이 파일의 관심사 중 하나라(StrictMode·재마운트·다음 판) api 모듈 하나만
// 갈아끼워 호출을 직접 센다. emojiPalette.store와 normalizeSlots는 실제 코드가 돈다.
const paletteGetCalls = []
let paletteGetImpl = async () => ({ ok: true, slots: GAME_SLOTS, revision: "rev-1", owned: OWNED })
let paletteSaveImpl = async ({ slots }) => ({ ok: true, slots, revision: "rev-2" })

mock.module("../../../../../user/api/emojiPalette.api.js", {
  namedExports: {
    getEmojiPaletteApi: async () => {
      paletteGetCalls.push(Date.now())
      return await paletteGetImpl()
    },
    saveEmojiPaletteApi: async (payload) => await paletteSaveImpl(payload),
  },
})

const { render, cleanup, fireEvent } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../../auth/store/auth.store.js")
const { useInGameStore } = await import("../../../store/ingameStore.js")
const { useEmojiPaletteStore } = await import("../../../../../user/store/emojiPalette.store.js")
const { setSocket } = await import("../../../../../../shared/socket/socketClient.js")
const { InGameActionProvider } = await import("../../../pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../InGamePlayerSessionProvider.jsx")
const { default: InGamePlayerBoard } = await import("../InGamePlayerBoard.jsx")
const { INGAME_PLAYER_CARD_MENU_ATTR } = await import("../InGamePlayerCardMenu.jsx")
const {
  INGAME_EMOJI_PALETTE_ATTR,
  INGAME_EMOJI_PALETTE_SLOT_COUNT,
  INGAME_EMOJI_PALETTE_FRAME_WIDTH,
  INGAME_EMOJI_PALETTE_FRAME_HEIGHT,
} = await import("../InGameEmojiPalette.jsx")
const { INGAME_E2E_ATTRS } = await import("../../../constants/e2e/ingameE2eHooks.js")

const SELF = "uuid-self"
const OTHER = "uuid-other"

// 실제 카탈로그(storeItems.js)의 이모티콘 id다 — 카탈로그에 없는 id는 그리지 않는 것이 계약이라
// 여기서 가짜 id를 쓰면 이 시험이 "칸이 비어 있어서" 통과한다.
const HELLO = "emoji-basic-hello"
const LOVE = "emoji-basic-love"
const GRIN = "emoji-basic-grin"
const OWNED = [HELLO, LOVE, GRIN]
const GAME_SLOTS = [HELLO, LOVE, null, null, null, null, null, null]
const NEXT_GAME_SLOTS = [GRIN, null, null, null, null, null, null, null]

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/**
 * emitWithAck을 기록하고 그 ACK를 시험이 원하는 시점에 해결·거부할 수 있는 최소 소켓.
 *
 * id가 반드시 있어야 한다 — useInGameEmojiSend가 요청 시점의 수신 범위(소켓 객체·id·연결 여부)를
 * 캡처해 응답을 대조하므로, id 없는 대역을 쓰면 모든 응답이 fail-closed로 거부되고 시험이
 * 엉뚱한 이유로 통과한다.
 */
function createFakeSocket({ id = "sock-1", connected = true } = {}) {
  const emitted = []
  const acks = []
  return {
    id,
    connected,
    emitted,
    acks,
    emit(event, payload, ack) { emitted.push({ event, payload, ack }) },
    emitWithAck(event, payload) {
      const deferred = createDeferred()
      emitted.push({ event, payload })
      acks.push(deferred)
      return deferred.promise
    },
    on() {},
    off() {},
  }
}

function roster({ selfAlive = true, selfParticipating = true } = {}) {
  return [
    {
      uuid: SELF, nickname: "본인", alive: selfAlive, isParticipating: selfParticipating,
      membershipId: "mem-self", themeIndex: 0,
    },
    { uuid: OTHER, nickname: "상대", alive: true, isParticipating: true, membershipId: "mem-other", themeIndex: 1 },
  ]
}

/**
 * 재판 구간 + 피고가 **본인**인 상태를 기본으로 쓴다.
 *
 * 본인 카드에 좌클릭 메뉴 항목이 생기는 유일한 구간이기 때문이다(투표·밤 행동·추방은 모두
 * 본인을 제외한다). 그래서 "칸을 눌렀는데 카드 메뉴가 열리지 않는다"는 단언이 **메뉴가 애초에
 * 없어서** 통과하는 일이 없다 — 전파가 새면 실제로 메뉴가 열린다.
 */
function gameState({
  gameId = "game-1", phase = "TRIBUNAL", dayPhase = "DAY_DISCUSSION",
  selfAlive = true, selfParticipating = true,
} = {}) {
  return {
    id: gameId,
    phase,
    dayPhase,
    dayIndex: 1,
    hostUuid: OTHER,
    roomId: "room-1",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    participationRevision: 0,
    tribunal: { defendantUuid: SELF },
    players: roster({ selfAlive, selfParticipating }),
    self: { uuid: SELF, nickname: "본인", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
  }
}

function seedGame(options = {}) {
  const { gameId = "game-1" } = options
  act(() => {
    useAuthStore.setState({ user: { uuid: SELF }, isLoggedIn: true })
    useInGameStore.getState().setGamePayload({ gameId, state: gameState(options) })
  })
}

function setUp(options = {}) {
  const socket = createFakeSocket(options.socket)
  act(() => {
    useInGameStore.getState().clearGame()
    useEmojiPaletteStore.getState().reset()
  })
  setSocket(socket === null ? null : socket)
  seedGame(options)
  return socket
}

/** 실제 생산 트리. Provider·보드·팔레트 어느 것도 대역하지 않는다. */
function mountBoard({ strict = false } = {}) {
  const tree = createElement(
    InGamePlayerSessionProvider,
    null,
    createElement(InGameActionProvider, { interactionBlocked: false }, createElement(InGamePlayerBoard)),
  )
  let view
  act(() => {
    view = render(strict ? createElement(StrictMode, null, tree) : tree)
  })
  return view
}

/** 조회 Promise와 그 뒤의 렌더 커밋이 모두 정착할 때까지 microtask를 흘린다. */
async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve() })
  }
}

function slotOf(container, nickname) {
  const card = container.querySelector(`[${INGAME_E2E_ATTRS.playerNickname}="${nickname}"]`)
  assert.ok(card, `${nickname} 카드를 실제 보드에서 찾지 못했다`)
  return card.closest('[role="button"]')
}

function paletteOf(container) {
  return container.querySelector(`[${INGAME_EMOJI_PALETTE_ATTR}]`)
}

function cardMenuOf(container) {
  return container.querySelector(`[${INGAME_PLAYER_CARD_MENU_ATTR}]`)
}

function openPalette(container, nickname = "본인") {
  act(() => { fireEvent.contextMenu(slotOf(container, nickname)) })
  return paletteOf(container)
}

function paletteCells(palette) {
  return [...palette.querySelectorAll("button")]
}

function cellFor(palette, label) {
  return paletteCells(palette).find((node) => node.getAttribute("aria-label") === label) ?? null
}

function sendEmojiEmits(socket) {
  return socket.emitted.filter((entry) => entry.event === "send_emoji")
}

test.afterEach(() => {
  cleanup()
  act(() => {
    useInGameStore.getState().clearGame()
    useEmojiPaletteStore.getState().reset()
    useAuthStore.setState({ user: null, isLoggedIn: false, identityGeneration: 0 })
  })
  setSocket(null)
  paletteGetCalls.length = 0
  paletteGetImpl = async () => ({ ok: true, slots: GAME_SLOTS, revision: "rev-1", owned: OWNED })
  paletteSaveImpl = async ({ slots }) => ({ ok: true, slots, revision: "rev-2" })
})

// ── AC-03: 우클릭 팔레트와 단일 전송 ────────────────────────────────────────

test("AC-03: 본인 카드 우클릭이 8칸 팔레트를 열고, 칸 클릭이 send_emoji를 한 번만 보낸다", async () => {
  const socket = setUp()
  const view = mountBoard()
  await settle()

  const palette = openPalette(view.container)
  assert.ok(palette, "본인 카드 우클릭으로 팔레트가 열리지 않았다")
  assert.equal(paletteCells(palette).length, INGAME_EMOJI_PALETTE_SLOT_COUNT,
    "팔레트 칸이 8개가 아니다")

  const cell = cellFor(palette, "안녕 보내기")
  assert.ok(cell, "이 판의 팔레트 사본이 칸에 반영되지 않았다(빈 팔레트를 보고 있다)")

  act(() => { fireEvent.click(cell) })
  await settle()

  assert.deepEqual(sendEmojiEmits(socket).map((entry) => entry.payload),
    [{ gameId: "game-1", itemId: HELLO }],
    "send_emoji가 정확히 한 번, 그 판의 gameId·고른 itemId로 나가지 않았다")
  // 칸 클릭이 조상 wrapper의 onClick(좌클릭 카드 메뉴)까지 올라가면 안 된다 — 이 구간의 본인
  // 카드에는 실제로 재판 투표 항목이 있으므로, 전파가 새면 메뉴가 정말로 열린다.
  assert.equal(cardMenuOf(view.container), null, "칸 선택이 좌클릭 카드 메뉴로 샜다")
  assert.equal(paletteOf(view.container), null, "선택 뒤에도 팔레트가 닫히지 않았다")
})

test("AC-03: 8칸이 한 점으로 붕괴하지 않는다 — 루트가 자산 종횡비로 자기 높이를 만든다", async () => {
  // 이 시험의 한계를 먼저 밝힌다: jsdom에는 배치 엔진이 없어 offsetHeight는 언제나 0이라,
  // "실제로 몇 픽셀인가"는 여기서 잴 수 없다(실제 브라우저 확인은 운영자 몫으로 남는다).
  // 대신 **높이가 0이 되는 원인 자체**를 본다 — 흐름에 남는 자식이 하나도 없는데 루트가 자기
  // 높이를 선언하지 않는 상태. 그 조합이면 칸의 백분율 높이와 top/left가 전부 0으로 풀려
  // 8칸이 한 점에 겹치고 선택 영역이 사라진다.
  setUp()
  const view = mountBoard()
  await settle()

  const palette = openPalette(view.container)
  assert.ok(palette, "전제: 팔레트가 열려야 한다")

  // (1) 배경도 8칸도 전부 absolute다 — 루트 높이를 만들어 줄 자식이 없다.
  const children = [...palette.children]
  assert.equal(children.length, INGAME_EMOJI_PALETTE_SLOT_COUNT + 1,
    "팔레트 루트의 자식은 배경 1 + 칸 8이어야 한다")
  for (const child of children) {
    assert.ok(child.getAttribute("class")?.split(/\s+/).includes("absolute"),
      `흐름에 남은 자식이 있다(${child.tagName}) — 이 시험의 전제가 깨졌으니 배치 근거를 다시 세워라`)
  }

  // (2) 그래서 루트가 폭만으로 높이를 갖도록 자산(769×738)의 종횡비를 직접 선언해야 한다.
  assert.equal(
    palette.style.aspectRatio.replace(/\s+/g, ""),
    `${INGAME_EMOJI_PALETTE_FRAME_WIDTH}/${INGAME_EMOJI_PALETTE_FRAME_HEIGHT}`,
    "루트에 높이 근거가 없다 — 자식이 전부 absolute라 높이가 0으로 붕괴한다",
  )

  // (3) 8칸은 서로 다른 8개의 자리를 갖는다(한 점에 겹쳐 그려지지 않는다).
  const positions = paletteCells(palette).map((cell) => `${cell.style.top}|${cell.style.left}`)
  assert.equal(positions.length, INGAME_EMOJI_PALETTE_SLOT_COUNT)
  assert.equal(new Set(positions).size, INGAME_EMOJI_PALETTE_SLOT_COUNT,
    "8칸이 서로 다른 자리에 놓이지 않았다(방사형 배치가 무너졌다)")
  for (const position of positions) {
    assert.match(position, /^\d+%\|\d+%$/, "칸의 자리가 루트 크기에 비례하지 않는다")
  }
})

test("AC-03: 칸 위에서 우클릭을 놓아도(mouseup button=2) send_emoji는 한 번뿐이다", async () => {
  const socket = setUp()
  const view = mountBoard()
  await settle()

  const palette = openPalette(view.container)
  const cell = cellFor(palette, "사랑 보내기")
  assert.ok(cell)

  act(() => { fireEvent.mouseUp(cell, { button: 2 }) })
  await settle()

  assert.deepEqual(sendEmojiEmits(socket).map((entry) => entry.payload),
    [{ gameId: "game-1", itemId: LOVE }],
    "우클릭 놓기가 send_emoji를 한 번 보내지 않았다(0회 또는 2회)")
  assert.equal(cardMenuOf(view.container), null, "우클릭 놓기가 좌클릭 카드 메뉴로 샜다")
})

test("AC-03: 빈 칸은 눌러도 아무것도 보내지 않는다", async () => {
  const socket = setUp()
  const view = mountBoard()
  await settle()

  const palette = openPalette(view.container)
  const empty = cellFor(palette, "3번 칸 비어 있음")
  assert.ok(empty, "빈 칸을 찾지 못했다")
  assert.equal(empty.disabled, true, "빈 칸이 비활성이 아니다")

  act(() => { fireEvent.click(empty) })
  await settle()
  assert.equal(sendEmojiEmits(socket).length, 0, "빈 칸이 전송을 만들었다")
})

test("AC-03: 타인 카드 우클릭은 팔레트를 열지 않는다", async () => {
  const socket = setUp()
  const view = mountBoard()
  await settle()

  act(() => { fireEvent.contextMenu(slotOf(view.container, "상대")) })
  assert.equal(paletteOf(view.container), null, "타인 카드 우클릭으로 팔레트가 열렸다")
  assert.equal(sendEmojiEmits(socket).length, 0)

  // 본인 카드에서는 같은 입력으로 열린다 — "어떤 카드에서도 안 열려서" 통과하지 않음을 고정한다.
  assert.ok(openPalette(view.container), "전제: 본인 카드에서는 팔레트가 열려야 한다")
})

test("AC-03: 본인 카드 좌클릭은 기존 카드 메뉴를 그대로 연다(우클릭 배선이 좌클릭을 덮지 않는다)", async () => {
  setUp()
  const view = mountBoard()
  await settle()

  // 본인 카드(이 구간의 피고) — 재판 투표 두 항목이 있는 기존 좌클릭 경로.
  act(() => { fireEvent.click(slotOf(view.container, "본인")) })
  assert.ok(cardMenuOf(view.container), "본인 카드 좌클릭 메뉴가 열리지 않았다(우클릭 배선이 좌클릭을 덮었다)")
  assert.equal(paletteOf(view.container), null, "좌클릭이 팔레트를 열었다")
})

test("AC-03: 타인 카드 좌클릭 메뉴도 그대로 열린다(낮 투표 구간)", async () => {
  setUp({ phase: "DAY", dayPhase: "DAY_VOTE" })
  const view = mountBoard()
  await settle()

  act(() => { fireEvent.click(slotOf(view.container, "상대")) })
  assert.ok(cardMenuOf(view.container), "타인 카드 좌클릭 메뉴가 열리지 않았다")
  assert.equal(paletteOf(view.container), null, "타인 카드 좌클릭이 팔레트를 열었다")
})

// ── AC-03: 팔레트 데이터의 수명(GET 횟수) ────────────────────────────────────

test("AC-03: StrictMode 이중 effect에서도 팔레트 GET은 1회다", async () => {
  setUp()
  mountBoard({ strict: true })
  await settle()
  assert.equal(paletteGetCalls.length, 1,
    `StrictMode 진입에서 GET이 ${paletteGetCalls.length}회 나갔다(1회여야 한다)`)
})

test("AC-03: 같은 계정·같은 판에서 보드를 다시 마운트해도 GET이 더 나가지 않고 슬롯도 같다", async () => {
  setUp()
  const first = mountBoard()
  await settle()
  assert.equal(paletteGetCalls.length, 1)
  const firstSlots = useEmojiPaletteStore.getState().gameSlots

  act(() => { first.unmount() })
  const second = mountBoard()
  await settle()

  assert.equal(paletteGetCalls.length, 1, "같은 판의 재마운트가 GET을 더 냈다")
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, firstSlots)
  assert.ok(cellFor(openPalette(second.container), "안녕 보내기"),
    "재마운트 뒤 팔레트 칸이 비어 있다")
})

test("AC-03: 같은 판에서 소켓이 재연결돼도 팔레트 캐시는 유지된다", async () => {
  setUp()
  mountBoard()
  await settle()
  assert.equal(paletteGetCalls.length, 1)

  // 같은 판·같은 계정의 새 연결. 이모티콘 scope의 세 축(계정·신원 세대·gameId)은 그대로다.
  setSocket(createFakeSocket({ id: "sock-2" }))
  await settle()

  assert.equal(paletteGetCalls.length, 1, "소켓 재연결이 팔레트를 다시 읽게 만들었다")
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready")
})

test("AC-03: 사망(alive=false)만으로는 팔레트 캐시를 버리지 않는다", async () => {
  setUp()
  mountBoard()
  await settle()
  const cached = useEmojiPaletteStore.getState().gameSlots

  act(() => {
    useInGameStore.setState((state) => ({
      state: { ...state.state, players: roster({ selfAlive: false }) },
    }))
  })
  await settle()

  assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready", "사망이 팔레트를 비웠다")
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, cached)
  assert.equal(paletteGetCalls.length, 1)
})

test("AC-03: 마이페이지 load/save는 이 판의 팔레트 사본을 바꾸지 않는다", async () => {
  setUp()
  mountBoard()
  await settle()
  const cached = [...useEmojiPaletteStore.getState().gameSlots]

  paletteGetImpl = async () => ({ ok: true, slots: NEXT_GAME_SLOTS, revision: "rev-9", owned: OWNED })
  await act(async () => { await useEmojiPaletteStore.getState().load() })
  await act(async () => {
    useEmojiPaletteStore.getState().selectSlot(0)
    useEmojiPaletteStore.getState().assignItem(GRIN)
    await useEmojiPaletteStore.getState().save()
  })
  await settle()

  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, cached,
    "마이페이지 편집·저장이 진행 중인 판의 팔레트를 바꿨다")
  assert.deepEqual(useEmojiPaletteStore.getState().slots, NEXT_GAME_SLOTS,
    "전제: 마이페이지 쪽 값은 실제로 갱신되어야 한다")
})

test("AC-03: 다음 판에 들어가면 GET이 한 번 더 나가고 새 슬롯이 반영된다", async () => {
  setUp()
  const view = mountBoard()
  await settle()
  assert.equal(paletteGetCalls.length, 1)

  paletteGetImpl = async () => ({ ok: true, slots: NEXT_GAME_SLOTS, revision: "rev-2", owned: OWNED })
  act(() => {
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({ gameId: "game-2", state: gameState({ gameId: "game-2" }) })
  })
  await settle()

  assert.equal(paletteGetCalls.length, 2, "다음 판에서 팔레트를 다시 읽지 않았다")
  const palette = openPalette(view.container)
  assert.ok(cellFor(palette, "씨익 보내기"), "다음 판의 새 슬롯이 반영되지 않았다")
  assert.equal(cellFor(palette, "안녕 보내기"), null, "이전 판의 슬롯이 남았다")
})

test("AC-03: 판이 끝나면(phase=ENDED) 팔레트 캐시가 비워지고 우클릭도 열리지 않는다", async () => {
  setUp()
  const view = mountBoard()
  await settle()
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready")

  act(() => {
    useInGameStore.setState((state) => ({ state: { ...state.state, phase: "ENDED" } }))
  })
  await settle()

  assert.equal(useEmojiPaletteStore.getState().gameScopeKey, null, "종료 뒤에도 팔레트 캐시가 남았다")
  assert.equal(useEmojiPaletteStore.getState().gameSlots, null)
  assert.equal(openPalette(view.container), null, "끝난 판에서 팔레트가 열렸다")
})

test("AC-03: 내가 그 판에서 빠지면(isParticipating=false) 팔레트 캐시가 비워진다", async () => {
  setUp()
  mountBoard()
  await settle()

  act(() => {
    useInGameStore.setState((state) => ({
      state: { ...state.state, players: roster({ selfParticipating: false }) },
    }))
  })
  await settle()

  assert.equal(useEmojiPaletteStore.getState().gameScopeKey, null)
  assert.equal(useEmojiPaletteStore.getState().gameSlots, null)
})

test("AC-03: 계정 전환·로그아웃은 팔레트 캐시를 비우고, 옛 pending 응답은 버려진다", async () => {
  const deferred = createDeferred()
  paletteGetImpl = () => deferred.promise
  setUp()
  mountBoard()
  await settle()
  assert.equal(paletteGetCalls.length, 1)
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "loading")

  // 신원 전이(로그아웃 → 다른 계정). emojiPalette.store의 auth 구독이 즉시 리셋한다.
  act(() => {
    useAuthStore.setState({ user: null, isLoggedIn: false, identityGeneration: 1 })
  })
  await settle()
  assert.equal(useEmojiPaletteStore.getState().gameScopeKey, null, "계정 전환 뒤에도 캐시가 남았다")

  // 그 뒤에 도착한 이전 신원의 응답은 어떤 상태도 세우지 않는다.
  deferred.resolve({ ok: true, slots: GAME_SLOTS, revision: "rev-1", owned: OWNED })
  await settle()
  assert.equal(useEmojiPaletteStore.getState().gameSlots, null,
    "전이 도중 날아간 응답이 새 신원의 화면에 반영됐다")
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "idle")
})

// ── AC-03: 연결·ACK 실패는 해결된 로컬 결과가 된다 ──────────────────────────

test("AC-03: 소켓이 없거나 연결돼 있지 않으면 send_emoji를 아예 보내지 않는다", async () => {
  const socket = setUp({ socket: { id: "sock-1", connected: false } })
  const view = mountBoard()
  await settle()

  // openPalette는 스스로 act를 쓴다 — 여기서 다시 act로 감싸면(중첩 act) 팔레트 커밋이
  // 바깥 act가 끝날 때까지 미뤄져 DOM에서 찾을 수 없다.
  const disconnectedCell = cellFor(openPalette(view.container), "안녕 보내기")
  assert.ok(disconnectedCell)
  act(() => { fireEvent.click(disconnectedCell) })
  await settle()
  assert.equal(sendEmojiEmits(socket).length, 0, "미연결 소켓으로 전송을 시도했다")

  setSocket(null)
  await settle()
  const noSocketCell = cellFor(openPalette(view.container), "안녕 보내기")
  assert.ok(noSocketCell)
  act(() => { fireEvent.click(noSocketCell) })
  await settle()
  assert.equal(sendEmojiEmits(socket).length, 0, "소켓이 없는데 전송을 시도했다")
})

test("AC-03: 대기 중인 ACK가 거부돼도 처리되지 않은 rejection 없이 끝난다", async () => {
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on("unhandledRejection", onUnhandled)
  try {
    const socket = setUp()
    const view = mountBoard()
    await settle()

    const cell = cellFor(openPalette(view.container), "안녕 보내기")
    assert.ok(cell)
    act(() => { fireEvent.click(cell) })
    await settle()
    assert.equal(socket.acks.length, 1, "전제: ACK 대기가 하나 있어야 한다")

    // 전송 중 연결이 끊기는 실제 모양: 소켓이 대기 중 ACK를 거부한다.
    socket.connected = false
    socket.acks[0].reject(new Error("operation has timed out"))
    await settle()
    assert.deepEqual(unhandled, [], "ACK 거부가 처리되지 않은 rejection을 만들었다")
  } finally {
    process.off("unhandledRejection", onUnhandled)
  }
})

test("AC-03: 늦은 ACK는 그 사이 판이 바뀌면 화면에 적용되지 않는다", async () => {
  const socket = setUp()
  const view = mountBoard()
  await settle()

  const cell = cellFor(openPalette(view.container), "안녕 보내기")
  assert.ok(cell)
  act(() => { fireEvent.click(cell) })
  await settle()
  assert.equal(socket.acks.length, 1)

  // 요청과 응답 사이에 다음 판으로 넘어간다.
  paletteGetImpl = async () => ({ ok: true, slots: NEXT_GAME_SLOTS, revision: "rev-2", owned: OWNED })
  act(() => {
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({ gameId: "game-2", state: gameState({ gameId: "game-2" }) })
  })
  await settle()

  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on("unhandledRejection", onUnhandled)
  try {
    socket.acks[0].resolve({ ok: true, sentAt: 1_000 })
    await settle()
    assert.deepEqual(unhandled, [])
  } finally {
    process.off("unhandledRejection", onUnhandled)
  }
  // 지난 판을 향해 나간 요청은 하나뿐이고, 늦은 성공 ACK가 새 판에 아무 전송도 만들지 않는다.
  assert.equal(sendEmojiEmits(socket).length, 1)
})
