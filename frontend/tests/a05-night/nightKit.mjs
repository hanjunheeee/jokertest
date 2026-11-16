// 밤 화면 시험 공용 도우미: 5~10명 판 값을 스토어에 넣고, 가짜 소켓으로 서버 알림을 흘리고, 판 화면을 그림
// a05-night 폴더 시험 파일들이 씀 (시험 파일은 맨 위에서 ../helpers/domSetup.mjs 먼저 부르고 이 파일을 await import)
//
// 쓰는 법
//   import "../helpers/domSetup.mjs"
//   const kit = await import("./nightKit.mjs")
//   test.afterEach(() => kit.reset())
//   const t = kit.openNight({ n: 7, me: 0, role: "JOKER", allies: [1] })   // 판 값 넣기 (밤, 첫 밤 = 날짜 1)
//   t.turnStarts("JOKER")                                                 // 서버가 보내는 차례 시작 알림
//   const view = kit.mountTable()                                         // 카드 판·구석 행동 칸을 그림
// 서버 알림 모양은 백엔드 흐름 시험(backend/tests/flow/a05a-*.test.js)이 받는 값과 같게 만듦
// 조심: assert.equal에 화면 요소(DOM)를 그대로 넣지 않음 — 틀리면 요소 속 React 정보까지 찍다가 메모리가 넘침 (참·거짓으로 바꿔 비교)
import { createElement, useContext } from "react"

const { render, act, cleanup, fireEvent, screen, within } = await import("@testing-library/react")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { onSessionEvents } = await import("../../src/domains/game/ingame/socket/session.js")
const { currentReceiptScope } = await import("../../src/domains/game/ingame/hooks/sessionEvents/scope.js")
const { createNightHandlers } = await import("../../src/domains/game/ingame/hooks/sessionEvents/nightHandlers.js")
const { createDayHandlers } = await import("../../src/domains/game/ingame/hooks/sessionEvents/dayHandlers.js")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { useInGamePlayerSessionContext } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionContext.js")
const { InGameActionContext } = await import("../../src/domains/game/ingame/context/InGameActionContext.jsx")
const { InGameActionProvider } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { default: InGamePlayerBoard } = await import("../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")
const { default: InGameCornerActionPanel } = await import("../../src/domains/game/ingame/components/actions/InGameCornerActionPanel.jsx")
const { default: InGameTimebarExpandedTimer } = await import("../../src/domains/game/ingame/components/timebar/InGameTimebarExpandedTimer.jsx")
const { useTurnProgress } = await import("../../src/domains/game/ingame/hooks/timebar/useTurnProgress.js")
const { selectInGameTimebarPhaseDeadline } = await import("../../src/domains/game/ingame/utils/timebar/phaseDeadline.js")

export { render, act, cleanup, fireEvent, screen, within, useInGameStore }

// 판 사람 닉네임 (10명까지), uuid는 u1~u10
export const NICKS = ["민수", "지영", "현우", "서연", "준호", "하은", "도윤", "수아", "시우", "지아"]
export const uuidOf = (index) => `u${index + 1}`

// 직업 → 팀 (서버 self 값 모양)
const TEAM = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }

// 직업 화면 이름 (e2e/helpers/ui.js ROLE_LABELS와 같음)
export const ROLE_LABELS = { JOKER: "광대", DOCTOR: "의사", GUARD: "경비원", WITCH_HUNTER: "마녀사냥꾼", CITIZEN: "시민" }

// 밤 행동 이름 (카드 메뉴 단추 글)
export const NIGHT_ACTION_LABELS = { JOKER: "암살", DOCTOR: "보호", GUARD: "조사", WITCH_HUNTER: "확인" }

// 지금 열린 판 하나와 가짜 소켓 (시험마다 reset으로 비움)
let live = null
let gameSeq = 0

// 가짜 소켓: 서버로 나간 요청은 sent에 모이고, 밤 행동 답은 setReply로 정함 (진짜 서버로 안 나감)
export function createFakeSocket() {
  const listeners = new Map()
  const sent = []
  let reply = { ok: true }
  const record = (event, payload) => {
    sent.push({ event, payload })
    return Promise.resolve(typeof reply === "function" ? reply(payload) : reply)
  }
  const socket = {
    id: "fake-socket-1",
    connected: true,
    sent,
    setReply(next) { reply = next },
    on(event, fn) {
      if (typeof fn !== "function") return socket
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      listeners.get(event)?.delete(fn)
      return socket
    },
    emit(event, payload) { sent.push({ event, payload }) },
    emitWithAck: record,
    timeout() { return { emitWithAck: record } },
    // 서버가 이 소켓에 알림을 보낸 것처럼 받기 손잡이를 부름
    serverEmit(event, payload) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn(payload)
    },
  }
  return socket
}

// 서버 판 상태 값 만들기 (명단·내 직업·같은 직업 동료·죽은 사람·끊긴 사람)
// me: 내 자리 번호, allies: 같은 직업 동료 자리 번호, dead/disconnected: 자리 번호 목록
export function buildGameState({ gameId, n, me = 0, role, allies = [], dead = [], disconnected = [], dayIndex = 1, phase = "NIGHT" }) {
  const players = Array.from({ length: n }, (_, i) => ({
    uuid: uuidOf(i),
    nickname: NICKS[i],
    isAlive: !dead.includes(i),
    isConnected: !disconnected.includes(i),
    themeIndex: i,
  }))
  const self = {
    uuid: uuidOf(me),
    nickname: NICKS[me],
    role,
    team: TEAM[role],
    hasActedThisPhase: false,
    ...(role === "CITIZEN" ? {} : { allies: allies.map(uuidOf) }),
  }
  return {
    id: gameId,
    phase,
    dayIndex,
    dayPhase: phase === "DAY" ? "DAY_DISCUSSION" : null,
    players,
    self,
    nightTurnRole: null,
    nightTurnDeadline: null,
  }
}

// 판 하나 열기: (로그인) → 가짜 소켓 연결 → 판 알림 받기 붙임 → 스토어에 판 값 넣기
// loggedIn: 차례 안내 창처럼 로그인 계정이 있어야 뜨는 것을 볼 때만 켬 (판 화면은 로그인하면 이모티콘 목록을 서버에 물어서 끔)
export function openNight(options) {
  reset()
  gameSeq += 1
  const gameId = options.gameId ?? `a05-night-${gameSeq}`
  if (options.loggedIn) {
    const me = options.me ?? 0
    act(() => { useAuthStore.getState().login({ uuid: uuidOf(me), nickname: NICKS[me] }) })
  }
  const socket = createFakeSocket()
  setSocket(socket)
  // 화면의 판 알림 받기(useGameSessionSocketEvents)와 같은 손잡이를 가짜 소켓에 붙임
  const registered = { ...currentReceiptScope() }
  const off = onSessionEvents(socket, { ...createDayHandlers(registered), ...createNightHandlers(registered) })
  const state = buildGameState({ ...options, gameId })
  act(() => { useInGameStore.getState().setGamePayload({ gameId, state }) })
  live = { gameId, socket, off, n: options.n }
  return table()
}

// 새로고침한 화면: 빈 스토어에 서버 스냅샷 답을 넣음 (밤 차례 역할·마감 같이)
export function openFromSnapshot({ n, me = 0, role, allies = [], dead = [], dayIndex = 1, nightTurnRole, nightTurnDeadline }) {
  reset()
  gameSeq += 1
  const gameId = `a05-night-snap-${gameSeq}`
  const socket = createFakeSocket()
  setSocket(socket)
  const registered = { ...currentReceiptScope() }
  const off = onSessionEvents(socket, { ...createDayHandlers(registered), ...createNightHandlers(registered) })
  const base = buildGameState({ gameId, n, me, role, allies, dead, dayIndex })
  const response = {
    ok: true,
    gameId,
    phase: "NIGHT",
    dayIndex,
    players: base.players,
    self: base.self,
    nightTurnRole,
    nightTurnDeadline,
  }
  act(() => { useInGameStore.getState().bootstrapSessionSnapshot(response) })
  live = { gameId, socket, off, n }
  return table()
}

// 지금 판에 서버 알림 보내기 묶음
export function table() {
  const { gameId, socket } = live
  const store = () => useInGameStore.getState()
  const dayIndex = () => store().state?.dayIndex
  const send = (event, payload) => act(() => { socket.serverEmit(event, payload) })
  return {
    gameId,
    socket,
    store,
    send,
    sent: socket.sent,
    // 밤 차례 시작 (마감은 주지 않으면 먼 뒤 시각)
    turnStarts(role, { deadline = Date.now() + 60_000, day = dayIndex(), game = gameId } = {}) {
      send("night_turn_started", { gameId: game, dayIndex: day, role, deadline })
    },
    turnEnds(role, { day = dayIndex() } = {}) {
      send("night_turn_ended", { gameId, dayIndex: day, role })
    },
    // 판정 끝 (서버는 마지막 차례 끝 다음에 이것을 보냄)
    actionsResolved({ day = dayIndex() } = {}) {
      send("night_actions_resolved", { gameId, dayIndex: day })
    },
    // 내게만 오는 밤 결과 (조사·확인은 대상·직업, 암살은 실패만)
    privateResult(fields, { day = dayIndex() } = {}) {
      send("night_action_result", { gameId, dayIndex: day, ...fields })
    },
    // 밤 결과: 희생자(자리 번호 또는 null) → 다음 낮, 끝난 판이면 winResult
    nightApplied({ victim = null, doctorSaved = false, dayPhaseDeadline = Date.now() + 120_000, winner = null } = {}) {
      const current = store().state
      const victimUuid = victim === null ? null : uuidOf(victim)
      const deadNow = (p) => p.alive === false || p.uuid === victimUuid
      if (winner) {
        send("night_result_applied", {
          gameId,
          phase: "ENDED",
          dayIndex: current.dayIndex,
          players: current.players.map((p) => ({ uuid: p.uuid, isAlive: !deadNow(p) })),
          victimUuid,
          deathReveals: victimUuid ? [{ victimUuid, source: "JOKER" }] : [],
          doctorSaved,
          winResult: { winner },
        })
        return
      }
      send("night_result_applied", {
        gameId,
        phase: "DAY",
        dayIndex: current.dayIndex + 1,
        players: current.players.map((p) => ({ uuid: p.uuid, alive: !deadNow(p) })),
        victimUuid,
        deathReveals: victimUuid ? [{ victimUuid, source: "JOKER" }] : [],
        doctorSaved,
        dayPhaseDeadline,
      })
    },
    // 낮을 모두 기권으로 넘겨 밤으로 (투표 시작 알림 → 판정 알림)
    dayToNight() {
      const current = store().state
      const aliveCount = current.players.filter((p) => p.alive !== false).length
      send("day_phase_changed", { gameId, dayIndex: current.dayIndex, dayPhase: "DAY_VOTE", round: 1 })
      send("day_vote_resolved", {
        gameId,
        dayIndex: current.dayIndex,
        phase: "NIGHT",
        outcome: "ABSTAINED",
        tribunalTargetUuid: null,
        publicVoteCount: aliveCount,
        publicAbstainCount: aliveCount,
        round: 1,
      })
    },
    // 서버로 나간 밤 행동 요청 대상들 (null = 건너뛰기)
    nightSubmits() {
      return socket.sent.filter((entry) => entry.event === "submit_night_action").map((entry) => entry.payload.targetId)
    },
  }
}

// 차례 남은 시간 (InGamePage처럼 지금 단계 마감 → 남은 초 → MM:SS 글)
export function TurnTimer() {
  const deadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const { remainingRatio, remainingSec } = useTurnProgress(deadline)
  return createElement(InGameTimebarExpandedTimer, { remainingRatio, remainingSec, variant: "standalone" })
}

// 판 화면 그리기: 카드 판 + 구석 행동 칸 (InGamePage와 같은 Provider 차례), probe로 행동 값·명단을 꺼냄
// extra: 같은 Provider 안에 더 그릴 것 (예: TurnTimer)
export function mountTable({ interactionBlocked = false, extra = [] } = {}) {
  const probe = { ctx: null, session: null }
  function Probe() {
    probe.ctx = useContext(InGameActionContext)
    probe.session = useInGamePlayerSessionContext()
    return null
  }
  const view = render(
    createElement(
      InGamePlayerSessionProvider,
      null,
      createElement(
        InGameActionProvider,
        { interactionBlocked },
        createElement(Probe),
        createElement(InGameCornerActionPanel),
        createElement(InGamePlayerBoard),
        ...extra,
      ),
    ),
  )
  return { ...view, probe }
}

// 그린 판에서 닉네임으로 카드 누름 칸 찾기
export function cardButton(container, nickname) {
  const card = container.querySelector(`[data-ingame-player-nickname="${nickname}"]`)
  if (!card) throw new Error(`카드 없음: ${nickname}`)
  return card.closest("[role=button]")
}

// 카드를 눌러 열린 메뉴의 단추 목록 (메뉴가 안 열리면 빈 목록)
export function openCardMenu(container, nickname) {
  act(() => { fireEvent.click(cardButton(container, nickname)) })
  const slot = cardButton(container, nickname).parentElement
  const menu = slot.querySelector("[role=menu]")
  if (!menu) return []
  return [...menu.querySelectorAll("[role=menuitem]")]
}

// 카드 메뉴의 밤 행동 단추 (없으면 null)
export function nightMenuItem(container, nickname, role) {
  const items = openCardMenu(container, nickname)
  const label = NIGHT_ACTION_LABELS[role]
  const found = items.find((button) => button.getAttribute("aria-label") === label) ?? null
  // 다음 확인을 위해 메뉴를 닫음 (열린 채면 같은 카드를 다시 눌렀을 때 닫혀 버림)
  if (items.length > 0) act(() => { fireEvent.keyDown(document, { key: "Escape" }) })
  return found
}

// 카드 메뉴를 연 채로 밤 행동 단추 꺼내기 (눌러 볼 때 씀, 없으면 null)
export function openNightItem(container, nickname, role) {
  const items = openCardMenu(container, nickname)
  return items.find((button) => button.getAttribute("aria-label") === NIGHT_ACTION_LABELS[role]) ?? null
}

// 구석 행동 칸의 건너뛰기 단추 (없으면 null)
export function skipButton(container) {
  return container.querySelector('[data-ingame-phase-action="nightSkip"]')
}

// 밤 행동 응답이 돌아와 화면이 바뀔 때까지 기다림 (가짜 소켓 답은 바로 풀리는 약속)
export async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

// 시험 하나 끝: 화면 지우기 → 알림 받기 떼기 → 판 비우기 → 소켓 끊기
export function reset() {
  cleanup()
  if (live) {
    live.off()
    live = null
  }
  act(() => {
    useInGameStore.getState().clearGame()
    setSocket(null)
    if (useAuthStore.getState().isLoggedIn) useAuthStore.getState().logout()
  })
}
