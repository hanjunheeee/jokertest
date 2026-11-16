// 판 중 채팅 화면 시험 같이 쓰는 준비 파일 (가짜 소켓·판 차리기·화면 그리기·채팅 알림 넣기·찾기)
// a06-chat 폴더 시험만 씀 — 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-001~200
//
// 쓰는 법
//   import { openTable, resetTable } from "./a06Kit.mjs"
//   test.afterEach(resetTable)
//   const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", phase: "NIGHT", view: "page" })
//   await t.roleChat(2, "같이 지키자")          // 서버: 같은 직업 밤 채팅 한 줄
//   await t.type("안녕"); await t.enter()       // 채팅 칸에 쳐서 Enter
//   t.sentOf("submit_joker_chat_message")       // 보낸 요청 값
// 서버 알림 값 모양은 커밋된 백엔드 시험·서버 코드(backend/socket/gameSession/handlers/chat.js) 그대로 만듦
import { mock } from "node:test"
import "../helpers/domSetup.mjs"

// jsdom에 없는 크기 감시 흉내 (채팅 칸이 씀, 크기는 안 재서 아무것도 안 함)
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoopResizeObserver
window.ResizeObserver = NoopResizeObserver
// 판에서 빠질 때 알림 창 → 시험에선 조용히 넘김
window.alert = () => {}

// 창 열고 닫는 움직임은 바로 끝냄 (안 끄면 닫힘 움직임이 안 끝나 메모리가 바닥남)
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true

// 가짜 fetch: 진짜 요청이 안 나가게 막음, 이모티콘 팔레트만 정한 칸으로 답함
export const fetchCalls = []
let paletteSlots = []
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url))
  const body = String(url).includes("/user/me/emoji-palette")
    ? { data: { slots: paletteSlots, revision: "r1", owned: paletteSlots.filter(Boolean) } }
    : { data: {} }
  const response = {
    status: 200,
    ok: true,
    json: async () => body,
    clone: () => response,
  }
  return response
}
window.fetch = globalThis.fetch

export const React = await import("react")
export const RTL = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider, Outlet, useRouteError } = await import("react-router-dom")
export const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")
const { default: InGamePage, InGameActionProvider } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { InGameChatSessionProvider } = await import("../../src/domains/game/ingame/components/chat/InGameChatSessionProvider.jsx")
const { InGameChatSessionContext } = await import("../../src/domains/game/ingame/components/chat/InGameChatSessionContext.js")
const { default: InGameChatShell } = await import("../../src/domains/game/ingame/components/chat/InGameChatShell.jsx")
const { default: InGameTribunalPresentationGate } = await import("../../src/domains/game/ingame/components/tribunalPresentation/InGameTribunalPresentationGate.jsx")
const { default: InGamePlayerBoard } = await import("../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")
export const { useInGameEmojiBubbleStore } = await import("../../src/domains/game/ingame/store/inGameEmojiBubble.store.js")
const { useEmojiPaletteStore } = await import("../../src/domains/user/store/emojiPalette.store.js")
const { useSettingsStore } = await import("../../src/domains/settings/store/settingsStore.js")
const { useInGameEmojiSend } = await import("../../src/domains/game/ingame/hooks/useInGameEmojiSend.js")

const h = React.createElement

// 자리마다 닉네임 (직업 이름과 안 겹치는 낱말만)
export const NICKNAMES = ["여우", "달빛", "별빛", "나비", "장미", "백합", "부엉이", "백조", "고양이", "까마귀"]
// 직업 → 팀 (서버 ROLE_TEAMS와 같음)
const TEAM_OF = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }
// 같은 직업 동료 목록이 오는 직업 (결정 "역할 확인 — 누가 누구 직업을 보나")
const ALLY_ROLES = new Set(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])
// 팔레트에 넣어 둘 이모티콘 (기본 지급 것, 상점 목록에 있는 id)
export const EMOJI = { love: "emoji-basic-love", hello: "emoji-basic-hello", grin: "emoji-basic-grin" }
export const EMOJI_NAMES = { [EMOJI.love]: "사랑", [EMOJI.hello]: "안녕", [EMOJI.grin]: "씨익" }

// 판마다 다른 id (탭 저장소 채팅 기억·역할 공개 기억이 시험끼리 안 섞이게)
let tableCount = 0
let current = null
const onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine")

// 가짜 소켓: 받기 등록·보낸 요청 기록, 답은 acks 표대로 ("hold" = 시험이 손으로 답함, 함수 = 값 받아 답 만듦)
function makeFakeSocket(id, acks) {
  const listeners = new Map()
  const sent = []
  const waiting = []
  const ask = (event, payload) => {
    const entry = { event, payload }
    sent.push(entry)
    const rule = Object.hasOwn(acks, event) ? acks[event] : "hold"
    if (rule === "hold") {
      return new Promise((resolve, reject) => {
        entry.resolve = resolve
        entry.reject = reject
        waiting.push(entry)
      })
    }
    if (rule === "timeout") return Promise.reject(new Error("operation has timed out"))
    return Promise.resolve(typeof rule === "function" ? rule(payload) : rule)
  }
  const socket = {
    id,
    connected: true,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      listeners.get(event)?.delete(fn)
      return socket
    },
    emit(event, payload, callback) {
      const entry = { event, payload }
      sent.push(entry)
      if (typeof callback === "function") {
        entry.resolve = callback
        entry.reject = () => {}
        waiting.push(entry)
      }
      return socket
    },
    emitWithAck: ask,
    timeout() {
      return { emitWithAck: ask }
    },
  }
  return { socket, listeners, sent, waiting }
}

// 사건 받는 쪽 껍데기: 로그인 화면 묶음처럼 판 진행 알림 받기를 붙이고 아래 화면을 그림
function Shell() {
  useGameSessionSocketEvents()
  return h(Outlet)
}

// 화면이 그리다 터지면 적어 둠 (라우터가 오류를 삼켜 시험이 모르고 지나가지 않게)
function RenderErrorCatcher() {
  const error = useRouteError()
  if (current) current.renderError = error
  return h("p", null, "화면 오류 (시험 자리)")
}

// 채팅 세션 값·이모티콘 보내기 엿보기 (화면 상태 시험이 꺼내 봄)
function ChatProbe({ sink }) {
  sink.chat = React.useContext(InGameChatSessionContext)
  sink.emoji = useInGameEmojiSend()
  return null
}

// 판 차리기
// n: 5~10명, me: 내 자리, myRole: 내 직업, roles: { 자리: 직업 } (나머지 시민), dead·left: 죽은·빠진 자리
// phase: ROLE_REVEAL·DAY·TRIBUNAL·NIGHT·ENDED, defendant: 재판으로 시작할 때 피고 자리
// view: "page"(인게임 화면 전체) | "chat"(채팅 틀 + 재판 창) | "board"(카드 판) | "probe"(값만) | "none"
// acks: 사건별 답 덮어쓰기, palette: 팔레트 8칸 (이모티콘 id 또는 null)
export async function openTable({
  n = 5,
  me = 0,
  myRole = "CITIZEN",
  roles = {},
  names = {},
  dead = [],
  left = [],
  phase = "DAY",
  dayIndex,
  dayPhase = "DAY_VOTE",
  defendant = null,
  view = "page",
  acks = {},
  palette = [EMOJI.love, EMOJI.hello, EMOJI.grin, null, null, null, null, null],
  themeIndex = (i) => i,
} = {}) {
  if (!Number.isInteger(n) || n < 5 || n > 10) throw new Error(`판 인원은 5~10명 (받은 값 ${n})`)
  tableCount += 1
  paletteSlots = palette
  const gameId = `a06-g${tableCount}`
  const seats = Array.from({ length: n }, (_, i) => ({
    uuid: `a06-${tableCount}-p${i}`,
    nickname: names[i] ?? NICKNAMES[i],
    role: i === me ? myRole : (roles[i] ?? "CITIZEN"),
    alive: !dead.includes(i) && !left.includes(i),
    participating: !left.includes(i),
    themeIndex: themeIndex(i),
  }))
  const fake = makeFakeSocket(`a06-sock-${tableCount}`, {
    submit_game_chat_message: { ok: true },
    submit_joker_chat_message: { ok: true },
    send_emoji: () => ({ ok: true, sentAt: Date.now() }),
    ...acks,
  })
  const t = {
    gameId,
    seats,
    meIndex: me,
    fake,
    phase,
    dayIndex: dayIndex ?? (phase === "ROLE_REVEAL" ? 0 : 1),
    dayPhase,
    defendantIndex: defendant,
    sink: { chat: null, emoji: null },
    msgSeq: 0,
  }
  current = t
  t.uuid = (i) => seats[i].uuid
  t.nick = (i) => seats[i].nickname
  t.me = seats[me].uuid
  t.sentOf = (event) => fake.sent.filter((e) => e.event === event).map((e) => e.payload)
  t.state = () => useInGameStore.getState().state
  attachServer(t)
  attachFinders(t)

  setSocket(fake.socket)
  useAuthStore.getState().login({ uuid: t.me, nickname: seats[me].nickname })
  markRoleRevealSeen(gameId, t.me)
  t.seat()
  await t.mount(view)
  return t
}

// 판 값 만들기 (매칭 쪽 판 시작 알림 game_started가 스토어에 넣는 모양)
function buildGameState(t, { gameId = t.gameId } = {}) {
  const { seats } = t
  const mine = seats[t.meIndex]
  const self = {
    uuid: mine.uuid,
    nickname: mine.nickname,
    role: mine.role,
    team: TEAM_OF[mine.role],
    hasActedThisPhase: false,
    ...(ALLY_ROLES.has(mine.role)
      ? { allies: seats.filter((s, i) => i !== t.meIndex && s.role === mine.role).map((s) => s.uuid) }
      : {}),
  }
  const now = Date.now()
  return {
    id: gameId,
    phase: t.phase,
    dayIndex: t.dayIndex,
    ...(t.phase === "DAY" ? { dayPhase: t.dayPhase, dayPhaseDeadline: now + 60_000 } : {}),
    ...(t.phase === "TRIBUNAL"
      ? { tribunalDeadline: now + 60_000, tribunal: { defendantUuid: seats[t.defendantIndex].uuid, resolved: false } }
      : {}),
    ...(t.phase === "NIGHT" ? { nightTurnRole: null, nightTurnDeadline: null } : {}),
    players: seats.map((s) => ({
      uuid: s.uuid,
      nickname: s.nickname,
      isAlive: s.alive,
      isConnected: true,
      isParticipating: s.participating,
      themeIndex: s.themeIndex,
    })),
    self,
  }
}

// 서버 알림 보내기와 판 흐름 손잡이
function attachServer(t) {
  const { fake, seats } = t
  const aliveCount = () => seats.filter((s) => s.alive).length

  // 판 시작 값 넣기 (지금 t.phase 기준)
  t.seat = (options = {}) => {
    useInGameStore.getState().setGamePayload({ gameId: options.gameId ?? t.gameId, state: buildGameState(t, options) })
  }

  // 서버가 이 화면에 사건 하나 보냄
  t.say = async (event, payload) => {
    const fns = [...(fake.listeners.get(event) ?? [])]
    await RTL.act(async () => {
      for (const fn of fns) fn(payload)
    })
    await flush()
  }

  // 기다리는 요청 하나에 서버가 답함 (가장 먼저 보낸 것부터)
  t.answer = async (event, response) => {
    const index = fake.waiting.findIndex((e) => e.event === event)
    if (index < 0) throw new Error(`답할 ${event} 요청이 없음`)
    const [entry] = fake.waiting.splice(index, 1)
    await RTL.act(async () => { entry.resolve(response) })
    await flush()
  }
  // 기다리는 요청이 시간 초과로 끝남 (socket.io timeout 모양: 오류로 끝남)
  t.timeoutAck = async (event) => {
    const index = fake.waiting.findIndex((e) => e.event === event)
    if (index < 0) throw new Error(`시간 초과 낼 ${event} 요청이 없음`)
    const [entry] = fake.waiting.splice(index, 1)
    await RTL.act(async () => { entry.reject(new Error("operation has timed out")) })
    await flush()
  }

  // 채팅 알림 값 (서버 handlers/chat.js emit 모양)
  t.nextId = () => { t.msgSeq += 1; return `${t.gameId}-m${t.msgSeq}` }
  t.dayLine = (from, text, { id, sentAt, gameId = t.gameId } = {}) => ({
    gameId,
    senderUuid: seats[from].uuid,
    messageId: id ?? t.nextId(),
    nickname: seats[from].nickname,
    text,
    sentAt: sentAt ?? Date.now(),
    dayIndex: t.dayIndex,
  })
  t.roleLine = (from, text, { id, sentAt, gameId = t.gameId } = {}) => ({
    gameId,
    senderUuid: seats[from].uuid,
    text,
    messageId: id ?? t.nextId(),
    sentAt: sentAt ?? Date.now(),
  })
  t.dayChat = (from, text, options) => t.say("day_chat_message_received", t.dayLine(from, text, options))
  t.deadChat = (from, text, options) => t.say("dead_chat_message_received", t.dayLine(from, text, options))
  t.roleChat = (from, text, options) => t.say("joker_chat_message", t.roleLine(from, text, options))

  // 역할 확인 → 첫 낮 (서버 game_phase_changed 모양)
  t.toFirstDay = async () => {
    t.phase = "DAY"
    t.dayIndex = 1
    t.dayPhase = "DAY_DISCUSSION"
    await t.say("game_phase_changed", { gameId: t.gameId, phase: "DAY", dayIndex: 1, dayPhaseDeadline: Date.now() + 60_000 })
  }

  // 낮 투표 판정: 전원 기권 → 재판 없이 밤 (서버 day_vote_resolved 모양)
  t.toNight = async () => {
    const alive = aliveCount()
    t.phase = "NIGHT"
    await t.say("day_vote_resolved", {
      gameId: t.gameId,
      dayIndex: t.dayIndex,
      phase: "NIGHT",
      round: 1,
      outcome: "ABSTAINED",
      tribunalTargetUuid: null,
      publicVoteCount: alive,
      publicAbstainCount: alive,
      revoteExcludedUuids: [],
    })
  }

  // 낮 투표 판정 → 재판 (피고 자리, 또는 uuid로 명단 밖 사람)
  t.openTribunal = async (defendantIndex, { uuid } = {}) => {
    t.phase = "TRIBUNAL"
    t.defendantIndex = defendantIndex
    await t.say("day_vote_resolved", {
      gameId: t.gameId,
      dayIndex: t.dayIndex,
      phase: "TRIBUNAL",
      round: 1,
      outcome: "TRIBUNAL",
      tribunalTargetUuid: uuid ?? seats[defendantIndex].uuid,
      publicVoteCount: aliveCount(),
      publicAbstainCount: 0,
      revoteExcludedUuids: [],
      tribunalDeadline: Date.now() + 60_000,
    })
  }

  // 재판 결과 → 밤 (서버 tribunal_vote_resolved 지금 모양 — 표 수·직업 칸은 서버가 안 실음, 처형되면 그 사람 죽음)
  t.resolveTribunal = async (outcome) => {
    const defendantSeat = seats[t.defendantIndex]
    const executedUuid = outcome === "GUILTY" ? defendantSeat.uuid : null
    if (executedUuid) defendantSeat.alive = false
    t.phase = "NIGHT"
    await t.say("tribunal_vote_resolved", {
      gameId: t.gameId,
      dayIndex: t.dayIndex,
      phase: "NIGHT",
      defendantUuid: defendantSeat.uuid,
      outcome,
      executedUuid,
    })
  }

  // 밤 끝 → 새 낮 (서버 night_result_applied 모양), victim: 밤에 죽은 자리
  t.nextDay = async ({ victim = null } = {}) => {
    if (victim !== null) seats[victim].alive = false
    t.dayIndex += 1
    t.phase = "DAY"
    t.dayPhase = "DAY_DISCUSSION"
    await t.say("night_result_applied", {
      gameId: t.gameId,
      phase: "DAY",
      dayIndex: t.dayIndex,
      players: seats.map((s) => ({ uuid: s.uuid, alive: s.alive })),
      victimUuid: victim === null ? null : seats[victim].uuid,
      deathReveals: victim === null ? [] : [{ victimUuid: seats[victim].uuid, source: "JOKER" }],
      doctorSaved: false,
      dayPhaseDeadline: Date.now() + 60_000,
    })
  }

  // 밤 차례 시작 (서버 night_turn_started 모양)
  t.nightTurn = (role = "JOKER") =>
    t.say("night_turn_started", { gameId: t.gameId, dayIndex: t.dayIndex, role, deadline: Date.now() + 30_000 })

  // 이모티콘 말풍선 (서버 emoji_shown 모양)
  t.emojiShown = (from, itemId, { sentAt } = {}) =>
    t.say("emoji_shown", { gameId: t.gameId, uuid: seats[from].uuid, itemId, sentAt: sentAt ?? Date.now() })

  // 같은 사람들로 새 판 시작 (매칭 쪽 game_started가 스토어에 판 값을 넣음)
  t.newGame = async () => {
    tableCount += 1
    t.gameId = `a06-g${tableCount}`
    t.phase = "DAY"
    t.dayIndex = 1
    t.dayPhase = "DAY_DISCUSSION"
    markRoleRevealSeen(t.gameId, t.me)
    await RTL.act(async () => { t.seat() })
    await flush()
  }

  // 새로고침 흉내: 판 값을 비우고 서버 스냅샷 모양으로 다시 채움
  t.snapshot = () => {
    const state = buildGameState(t)
    // 차례 없는 밤이면 차례 칸은 안 실림 (서버 스냅샷 모양)
    const { id, players, ...rest } = state
    delete rest.nightTurnRole
    delete rest.nightTurnDeadline
    return {
      ok: true,
      gameId: id,
      hostUuid: seats[0].uuid,
      participationRevision: 0,
      selfProgressSeq: 0,
      ...rest,
      players,
    }
  }

  // 화면 그리기 (사건 받는 껍데기는 늘 붙임)
  t.mount = async (view) => {
    let element
    if (view === "page") element = h(InGamePage)
    else if (view === "chat") element = h(ChatTree, { t })
    else if (view === "board") element = h(BoardTree, { t })
    else if (view === "probe") element = h(ProbeTree, { t })
    else if (typeof view === "function") element = view(t)
    else element = null
    const router = createMemoryRouter([
      {
        element: h(Shell),
        errorElement: h(RenderErrorCatcher),
        children: [
          { path: "/ingame", element },
          { path: "*", element: h("p", null, "다른 화면 (시험 자리)") },
        ],
      },
    ], { initialEntries: ["/ingame"] })
    t.router = router
    await RTL.act(async () => {
      t.view = RTL.render(h(RouterProvider, { router }))
    })
    await flush()
    // 처음부터 죽은 나는 이미 "관전 계속하기"를 고른 사람으로 둠 (안 고르면 사망 뒤 선택 창이 화면을 잠금)
    if (view === "page") await t.keepWatching()
  }
  // 사망 뒤 선택 창이 떠 있으면 "관전 계속하기" 누름
  t.keepWatching = async () => {
    const button = [...document.querySelectorAll('[role="dialog"][aria-label="사망 후 선택"] button')]
      .find((b) => b.textContent.trim() === "관전 계속하기")
    if (!button) return false
    await RTL.act(async () => { RTL.fireEvent.click(button) })
    await flush()
    return true
  }
  t.path = () => t.router?.state.location.pathname ?? null
}

// 판 안 감싸기 차례는 인게임 화면과 같음 (카드·채팅이 같은 세션을 봄)
function Providers({ children }) {
  return h(InGamePlayerSessionProvider, null,
    h(InGameChatSessionProvider, null,
      h(InGameActionProvider, null, children)))
}
function ChatTree({ t }) {
  return h(Providers, null, h(ChatProbe, { sink: t.sink }), h(InGameChatShell), h(InGameTribunalPresentationGate))
}
function BoardTree({ t }) {
  return h(Providers, null, h(ChatProbe, { sink: t.sink }), h(InGamePlayerBoard))
}
function ProbeTree({ t }) {
  return h(Providers, null, h(ChatProbe, { sink: t.sink }))
}

// 화면에서 찾기·누르기 묶음
function attachFinders(t) {
  // 판 위 채팅 틀·크게 보기 창·재판 창 채팅
  t.board = () => document.querySelector('aside[aria-label="채팅"]')
  t.closeup = () => document.querySelector('[role="dialog"][aria-label="채팅 클로즈업"]')
  t.tribunalChat = () => document.querySelector('[aria-label="최후의 반론 채팅"]')
  // 지금 보이는 채팅 칸 (크게 보기 > 재판 창 > 판 위 틀)
  t.box = (where) => {
    if (where === "board") return t.board()
    if (where === "closeup") return t.closeup()
    if (where === "tribunal") return t.tribunalChat()
    return t.closeup() ?? t.tribunalChat() ?? t.board()
  }
  t.input = (where) => t.box(where)?.querySelector('textarea[aria-label="채팅 입력"]') ?? null
  t.sendButton = (where) => t.box(where)?.querySelector('button[aria-label="채팅 보내기"]') ?? null
  t.closedText = (where) => t.box(where)?.querySelector("[data-night-chat-closed]") ?? null
  t.deadBadge = (where) => t.box(where)?.querySelector("[data-dead-chat-badge]") ?? null
  t.statusText = (where) => t.box(where)?.querySelector('[role="alert"]')?.textContent ?? null
  // 채팅 줄 (맨 위 빈 칸 빼고), 글자만 꺼냄
  t.rowEls = (where) => [...(t.box(where)?.querySelectorAll('[role="log"] li:not([aria-hidden])') ?? [])]
  t.rows = (where) => t.rowEls(where).map((li) => li.textContent)
  // 글 치기 (사람이 붙여 넣거나 친 값)
  t.type = async (text, where) => {
    const input = t.input(where)
    if (!input) throw new Error("채팅 입력칸이 없음")
    await RTL.act(async () => { RTL.fireEvent.change(input, { target: { value: text } }) })
    await flush()
  }
  // Enter 누르기 (보내기), 막혔는지(기본 동작 막음) 돌려줌
  t.enter = async (where, init = {}) => {
    const input = t.input(where)
    if (!input) throw new Error("채팅 입력칸이 없음")
    let notCancelled = true
    await RTL.act(async () => { notCancelled = RTL.fireEvent.keyDown(input, { key: "Enter", code: "Enter", ...init }) })
    await flush()
    return notCancelled
  }
  t.click = async (element) => {
    await RTL.act(async () => { RTL.fireEvent.click(element) })
    await flush()
  }
  // 채팅 크게 보기 열기 (판 위 틀의 키보드용 단추)
  t.openCloseup = async () => {
    const button = [...(t.board()?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "채팅 크게 보기")
    if (!button) throw new Error("크게 보기 단추가 없음")
    await t.click(button)
  }
  // 사람 카드 (닉네임으로 찾음), 내 카드
  t.cardOf = (i) => [...document.querySelectorAll('[role="button"][aria-haspopup="menu"]')]
    .find((el) => el.textContent.includes(t.nick(i))) ?? null
  t.myCard = () => t.cardOf(t.meIndex)
  t.palette = () => document.querySelector('[role="group"][aria-label="이모티콘 팔레트"]')
  t.bubbleOn = (i) => t.cardOf(i)?.querySelector("[data-ingame-emoji-bubble]") ?? null
  // 카드 우클릭 (잠긴 덮개 안이면 사람이 못 누르므로 안 누름 → false)
  t.rightClick = async (element) => {
    if (!element || element.closest("[inert]")) return false
    await RTL.act(async () => { RTL.fireEvent.contextMenu(element) })
    await flush()
    return true
  }
}

// 약속 풀림·화면 다시 그리기 기다림 (판 화면엔 RTL waitFor 대신 이것)
export async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await RTL.act(async () => { await Promise.resolve() })
  }
}

// 가짜 시계 켜기 (setTimeout + Date), 화면 그리기 전에 부름
export function startFakeClock(now = 1_800_000_000_000) {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now })
}
// 가짜 시계 넘기기 (화면 바뀜까지)
export async function tick(ms) {
  await RTL.act(async () => { mock.timers.tick(ms) })
  await flush()
}

// 인터넷 끊김 흉내 (navigator.onLine = false)
export function goOffline() {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false })
}

// 저장해 둔 채팅 기억 넣기 (새로고침 전 탭 저장소 모양)
export function storeChatHistory(kind, gameId, authUuid, channels) {
  window.sessionStorage.setItem(`mmc:ingame:chat:${kind}`, JSON.stringify({ gameId, authUuid, channels }))
}

export { useAuthStore, useEmojiPaletteStore, useSettingsStore }

// 시험 하나 끝날 때: 화면 내림 → 시계 풂 → 판·로그인·소켓·탭 저장소·말풍선·설정 비움
export function resetTable() {
  const renderError = current?.renderError ?? null
  RTL.cleanup()
  mock.timers.reset()
  useInGameStore.getState().clearGame()
  useInGameStore.setState({ snapshotSeq: 0 })
  useAuthStore.getState().logout()
  setSocket(null)
  useInGameEmojiBubbleStore.getState().clearAllActiveEmoji()
  useEmojiPaletteStore.getState().resetGamePalette()
  useSettingsStore.setState({ chatTextSize: null })
  if (onlineDescriptor) Object.defineProperty(window.navigator, "onLine", onlineDescriptor)
  else delete window.navigator.onLine
  try {
    window.sessionStorage.clear()
  } catch {
    // 탭 저장소가 막힌 환경이면 그냥 둠
  }
  current = null
  if (renderError) throw renderError
}
