// 재판 화면 시험 도우미: 가짜 소켓·서버 알림 보내기·5~10명 판 차리기·화면 그리기 (a04-tribunal 폴더 시험만 씀)
// 시험 파일 맨 위에서 import, 공용 domSetup.mjs 위에 얹음 (공용 도우미는 안 고침 → 필요한 것은 여기 작게 둠)
//
// 쓰는 법
//   import { openTable, resetTable, RTL } from "./tribunalTable.mjs"
//   test.afterEach(resetTable)
//   const t = await openTable({ n: 7, me: 1, view: "page" })   // 1일 낮 투표 중인 7명 판, 나는 1번 자리 시민
//   await t.openTribunal(3)                                  // 서버: 낮 투표 판정 → 3번 자리 재판
//   await t.click(RTL.screen.getByRole("button", { name: "유죄" }))
//   t.sentOf("cast_tribunal_vote")                           // 보낸 요청 값
// 서버 알림 값 모양은 커밋된 백엔드 시험·서버 코드(backend/game-core·socket/gameSession) 그대로 만듦
import { mock } from "node:test"
import "../helpers/domSetup.mjs"

// jsdom에 없는 크기 감시 흉내 (채팅 칸이 씀, 크기는 안 재서 아무것도 안 함)
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = NoopResizeObserver
  globalThis.window.ResizeObserver = NoopResizeObserver
}

export const React = await import("react")
export const RTL = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider, Outlet, useRouteError } = await import("react-router-dom")
const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")
const { InGameActionContext } = await import("../../src/domains/game/ingame/context/InGameActionContext.jsx")
const { default: InGamePage, InGameActionProvider } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { InGameChatSessionProvider } = await import("../../src/domains/game/ingame/components/chat/InGameChatSessionProvider.jsx")
const { default: InGameTribunalPresentationGate } = await import("../../src/domains/game/ingame/components/tribunalPresentation/InGameTribunalPresentationGate.jsx")

const h = React.createElement

// 자리마다 닉네임 (직업 이름과 안 겹치는 낱말만)
const NICKNAMES = ["여우", "달빛", "별빛", "나비", "장미", "백합", "부엉이", "백조", "고양이", "까마귀"]

// 직업 → 팀 (서버 ROLE_TEAMS와 같음)
const TEAM_OF = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }
const ALLY_ROLES = new Set(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])

// 판마다 다른 id (탭 저장소의 역할 공개 기억·신원 범위가 시험끼리 안 섞이게)
let tableCount = 0

// 지금 열린 판 (시험 하나에 하나)
let current = null

// 가짜 소켓: 받기 등록·보낸 요청 기록·답 기다리기 (서버로 진짜 요청은 안 나감)
function makeFakeSocket(id) {
  const listeners = new Map()
  const sent = []
  const waiting = []
  const ask = (event, payload) => new Promise((resolve, reject) => {
    const entry = { event, payload, resolve, reject }
    sent.push(entry)
    waiting.push(entry)
  })
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
      const entry = { event, payload, resolve: typeof callback === "function" ? callback : () => {}, reject: () => {} }
      sent.push(entry)
      if (typeof callback === "function") waiting.push(entry)
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

// 행동 값 엿보기: 조작 컨텍스트 값을 시험이 꺼내 보게 적어 둠
function ActionProbe({ onValue }) {
  const value = React.useContext(InGameActionContext)
  onValue(value)
  return null
}

// 결과 화면 자리 (이동했는지 글로 확인)
const RESULT_PAGE_TEXT = "결과 화면 (시험 자리)"
export { RESULT_PAGE_TEXT }

// 판 차리기
// n: 5~10명, me: 내 자리, myRole: 내 직업, jokers: 광대 자리, names: { 자리: 닉네임 }, dead: 처음부터 죽은 자리
// phase·dayIndex·dayPhase: 처음 스냅샷 단계, defendant: 재판으로 시작할 때 피고 자리
// view: "none"(화면 없음) | "page"(인게임 화면 전체) | "actions"(조작 묶음 + 재판 창) | 함수(직접 그릴 것)
export async function openTable({
  n,
  me = 1,
  myRole = "CITIZEN",
  jokers = [0],
  names = {},
  dead = [],
  phase = "DAY",
  dayIndex = 1,
  dayPhase = "DAY_VOTE",
  defendant = null,
  tribunalSeconds = 60,
  selfExtra = {},
  view = "none",
} = {}) {
  if (!Number.isInteger(n) || n < 5 || n > 10) throw new Error(`판 인원은 5~10명 (받은 값 ${n})`)
  tableCount += 1
  const gameId = `a04-game-${tableCount}`
  const seats = Array.from({ length: n }, (_, i) => ({
    uuid: `a04-${tableCount}-p${i}`,
    nickname: names[i] ?? NICKNAMES[i],
    role: i === me ? myRole : (jokers.includes(i) ? "JOKER" : "CITIZEN"),
    alive: !dead.includes(i),
    connected: true,
  }))
  const fake = makeFakeSocket(`a04-sock-${tableCount}`)

  const t = {
    gameId,
    seats,
    meIndex: me,
    fake,
    phase,
    dayIndex,
    dayPhase,
    defendantIndex: defendant,
    tribunalDeadline: null,
    selfProgressSeq: 0,
    actionValue: null,
    router: null,
  }
  current = t

  t.uuid = (i) => seats[i].uuid
  t.nick = (i) => seats[i].nickname
  t.me = seats[me].uuid
  t.indexOf = (uuid) => seats.findIndex((seat) => seat.uuid === uuid)

  // 스토어에서 꺼내 보기
  t.store = () => useInGameStore.getState()
  t.state = () => useInGameStore.getState().state
  t.self = () => useInGameStore.getState().state?.self ?? null
  t.player = (i) => (useInGameStore.getState().state?.players ?? []).find((p) => p.uuid === seats[i].uuid) ?? null
  t.ctx = () => {
    if (t.renderError) throw t.renderError
    return t.actionValue
  }
  // 지우기를 놓친 화면처럼 본인 정보 칸을 바로 넣음 (준비 값 만들기만, 서버 알림으론 못 만드는 상태)
  t.patchSelf = async (fields) => {
    await RTL.act(async () => {
      useInGameStore.setState((store) => ({ state: { ...store.state, self: { ...store.state.self, ...fields } } }))
    })
  }
  t.path = () => t.router?.state.location.pathname ?? null
  attachRender(t)
  attachServer(t)

  // 보낸 요청 값 (사건 이름으로 거름)
  t.sentOf = (event) => fake.sent.filter((entry) => entry.event === event).map((entry) => entry.payload)

  // 서버 공개 명단 한 줄 (스냅샷 모양)
  const publicPlayer = (seat, i) => ({
    uuid: seat.uuid,
    nickname: seat.nickname,
    isAlive: seat.alive,
    isConnected: seat.connected,
    isParticipating: true,
    membershipId: null,
    themeIndex: i,
  })

  // 지금 단계 공개 진행 수 (서버 buildPublicProgress 모양)
  const progressNow = (done = 0) => {
    if (t.phase === "TRIBUNAL") {
      const required = seats.filter((s, i) => s.alive && i !== t.defendantIndex).length
      return { kind: "TRIBUNAL", doneCount: done, requiredCount: required }
    }
    if (t.phase === "DAY") {
      const required = seats.filter((s) => s.alive).length
      return { kind: t.dayPhase === "DAY_DISCUSSION" ? "DAY_DISCUSSION" : "DAY_VOTE", doneCount: done, requiredCount: required }
    }
    return { kind: t.phase === "NIGHT" ? "NIGHT" : "NONE", doneCount: null, requiredCount: null }
  }
  t.progressNow = progressNow

  // 스냅샷 응답 만들기 (서버 buildSessionSnapshot 모양, over로 칸 바꿈)
  t.snapshot = (over = {}) => {
    const mine = seats[me]
    const self = {
      uuid: mine.uuid,
      nickname: mine.nickname,
      role: mine.role,
      team: TEAM_OF[mine.role],
      ...(ALLY_ROLES.has(mine.role)
        ? { allies: seats.filter((s, i) => i !== me && s.role === mine.role).map((s) => s.uuid) }
        : {}),
      hasActedThisPhase: false,
      ...(t.phase === "TRIBUNAL" ? { hasSubmittedTribunalVote: false } : {}),
      ...(t.phase === "DAY" && t.dayPhase === "DAY_VOTE"
        ? { hasSubmittedDayVote: false, dayVoteTargetUuid: null, dayVoteRound: 1 }
        : {}),
      ...(t.phase === "DAY" && t.dayPhase === "DAY_DISCUSSION" ? { isDayVoteReady: false } : {}),
      ...selfExtra,
      ...(over.self ?? {}),
    }
    const response = {
      ok: true,
      gameId,
      phase: t.phase,
      dayIndex: t.dayIndex,
      hostUuid: seats[0].uuid,
      roomId: null,
      roomInstanceId: null,
      bootEpoch: null,
      roomCode: null,
      participationRevision: 0,
      selfProgressSeq: t.selfProgressSeq,
      ...(t.phase === "DAY" ? { dayPhase: t.dayPhase, dayPhaseDeadline: Date.now() + 60_000 } : {}),
      ...(t.phase === "TRIBUNAL" && Number.isFinite(t.tribunalDeadline) ? { tribunalDeadline: t.tribunalDeadline } : {}),
      players: seats.map(publicPlayer),
      self,
      progress: progressNow(),
    }
    if (t.phase === "TRIBUNAL" && t.defendantIndex !== null) {
      const alive = seats.filter((s) => s.alive).length
      response.dayVoteResolution = {
        round: 1,
        outcome: "TRIBUNAL",
        tribunalTargetUuid: seats[t.defendantIndex].uuid,
        publicVoteCount: alive,
        publicAbstainCount: 0,
        revoteExcludedUuids: [],
      }
      response.tribunal = { defendantUuid: seats[t.defendantIndex].uuid, resolved: false }
    }
    const { self: _ignored, ...rest } = over
    return { ...response, ...rest }
  }

  // 처음 들어온 화면처럼 스냅샷으로 빈 스토어 채움 (틀리면 판이 안 차려져 멈춤)
  if (phase === "TRIBUNAL") t.tribunalDeadline = Date.now() + tribunalSeconds * 1000
  setSocket(fake.socket)
  useAuthStore.getState().login({ uuid: t.me, nickname: seats[me].nickname })
  markRoleRevealSeen(gameId, t.me)
  useInGameStore.getState().bootstrapSessionSnapshot(t.snapshot(), null)
  if (useInGameStore.getState().gameId !== gameId) throw new Error("판 차리기 실패: 스냅샷을 스토어가 안 받음")

  // 화면 그리기 (사건 받는 껍데기는 늘 붙임)
  await t.mount(view)
  return t
}

// 화면 그리기 묶음 (openTable 안에서 t에 붙임)
function attachRender(t) {
  t.mount = async (view) => {
    let element
    if (view === "page") {
      element = h(InGamePage)
    } else if (view === "actions") {
      element = h(ActionHarness, { t })
    } else if (typeof view === "function") {
      element = view(t)
    } else {
      element = null
    }
    t.router = createMemoryRouter([
      {
        element: h(Shell),
        errorElement: h(RenderErrorCatcher),
        children: [
          { path: "/ingame", element },
          { path: "/gameresult", element: h("p", null, RESULT_PAGE_TEXT) },
          { path: "*", element: h("p", null, "다른 화면 (시험 자리)") },
        ],
      },
    ], { initialEntries: ["/ingame"] })
    // 화면 이동 기록 (이동 신호가 몇 번 났는지 셈)
    t.navigations = []
    let lastKey = t.router.state.location.key
    t.router.subscribe((state) => {
      if (state.location.key === lastKey) return
      lastKey = state.location.key
      t.navigations.push(state.location.pathname)
    })
    await RTL.act(async () => {
      RTL.render(h(RouterProvider, { router: t.router }))
    })
  }
}

// 조작 묶음 + 재판 창 (인게임 화면과 같은 감싸기 차례, 행동 값을 엿봄)
function ActionHarness({ t, children = null }) {
  return h(
    InGamePlayerSessionProvider, null,
    h(InGameChatSessionProvider, null,
      h(InGameActionProvider, null,
        h(ActionProbe, { onValue: (value) => { t.actionValue = value } }),
        h(InGameTribunalPresentationGate),
        children,
      ),
    ),
  )
}
export { ActionHarness, ActionProbe, InGameActionProvider, InGamePlayerSessionProvider, InGameChatSessionProvider, InGameTribunalPresentationGate }

// 서버 알림 보내기와 판 흐름 손잡이 (openTable 안에서 t에 붙임)
function attachServer(t) {
  const { fake, seats } = t
  const now = () => Date.now()
  const aliveCount = () => seats.filter((s) => s.alive).length

  // 서버가 이 화면에 사건 하나 보냄 (붙은 받기 전부에 그대로)
  t.say = async (event, payload) => {
    const fns = [...(fake.listeners.get(event) ?? [])]
    await RTL.act(async () => {
      for (const fn of fns) fn(payload)
    })
  }

  // 기다리는 요청 하나에 서버가 답함 (가장 먼저 보낸 것부터)
  t.answer = async (event, response) => {
    const index = fake.waiting.findIndex((entry) => entry.event === event)
    if (index < 0) throw new Error(`답할 ${event} 요청이 없음`)
    const [entry] = fake.waiting.splice(index, 1)
    await RTL.act(async () => {
      entry.resolve(response)
    })
  }

  // 누르기·키 누르기 (화면 바뀜까지 기다림)
  t.click = async (element) => {
    await RTL.act(async () => {
      RTL.fireEvent.click(element)
    })
  }
  t.key = async (element, key) => {
    await RTL.act(async () => {
      RTL.fireEvent.keyDown(element, { key })
    })
  }

  // 낮 투표 판정 → 재판 (서버 buildDayVoteResolvedPayload + tribunalDeadline 모양)
  t.tribunalEntryPayload = (defendantIndex, { seconds = 60, dayIndex = t.dayIndex, gameId = t.gameId, uuid } = {}) => ({
    gameId,
    dayIndex,
    phase: "TRIBUNAL",
    round: 1,
    outcome: "TRIBUNAL",
    tribunalTargetUuid: uuid ?? seats[defendantIndex].uuid,
    publicVoteCount: aliveCount(),
    publicAbstainCount: 0,
    revoteExcludedUuids: [],
    tribunalDeadline: now() + seconds * 1000,
  })
  t.openTribunal = async (defendantIndex, options = {}) => {
    const payload = t.tribunalEntryPayload(defendantIndex, options)
    t.phase = "TRIBUNAL"
    t.defendantIndex = defendantIndex
    t.tribunalDeadline = payload.tribunalDeadline
    await t.say("day_vote_resolved", payload)
    return payload
  }

  // 재판 없이 밤으로 가는 낮 판정 (동표·기권 많음·전원 기권·피고로 뽑힌 사람이 끊겨 있음)
  t.nightOutcomePayload = (outcome) => {
    const alive = aliveCount()
    const abstain = outcome === "ABSTAINED" ? alive : (outcome === "ABSTAIN_MAJORITY" ? Math.ceil(alive / 2) : 1)
    return {
      gameId: t.gameId,
      dayIndex: t.dayIndex,
      phase: "NIGHT",
      round: 1,
      outcome,
      tribunalTargetUuid: null,
      publicVoteCount: alive,
      publicAbstainCount: abstain,
      revoteExcludedUuids: [],
    }
  }

  // 나에게만 오는 내 진행 알림 (서버 emitSelfProgress 모양)
  t.myProgress = async (self, { done = 0, gameId = t.gameId } = {}) => {
    t.selfProgressSeq += 1
    await t.say("session_self_progress", {
      gameId,
      phase: t.phase,
      dayIndex: t.dayIndex,
      participationRevision: 0,
      selfProgressSeq: t.selfProgressSeq,
      progress: t.progressNow(done),
      self,
    })
  }

  // 재판 결과 알림 (서버 buildTribunalVoteResolvedPayload + 판 끝 칸 모양 — 표 수·처형된 사람 직업은 서버가 안 실음)
  // ended: 판이 끝나면 이긴 쪽 ("CITIZEN"·"JOKER")
  // counts·executedRole: 옛 서버처럼 그 칸이 실려 와도 화면에 안 새는지 볼 때만 넣음
  // 결과 이름 DEFENDANT_DIED = 재판 도중 끊긴 피고가 60초 안에 못 돌아와 죽음 (취소와 달리 이유 칸 없음)
  t.resolvedPayload = (outcome, { counts, executedRole, ended = null, defendantIndex = t.defendantIndex, gameId = t.gameId, dayIndex = t.dayIndex, resultClosesAt } = {}) => {
    const defendant = seats[defendantIndex]
    const executedUuid = outcome === "GUILTY" ? defendant.uuid : null
    const payload = {
      ...(outcome === "CANCELLED" ? { reason: "DEFENDANT_LEFT" } : {}),
      gameId,
      dayIndex,
      phase: ended ? "ENDED" : "NIGHT",
      defendantUuid: defendant.uuid,
      outcome,
      ...(counts ? { counts } : {}),
      executedUuid,
      ...(executedRole ? { executedRole } : {}),
    }
    if (!ended) return payload
    const aliveAfter = seats.map((s) => ({ uuid: s.uuid, isAlive: s.alive && s.uuid !== executedUuid }))
    return {
      ...payload,
      players: aliveAfter,
      winResult: {
        winner: ended,
        reveals: seats.map((s) => ({
          uuid: s.uuid,
          nickname: s.nickname,
          role: s.role,
          team: TEAM_OF[s.role],
          alive: s.alive && s.uuid !== executedUuid,
          deathReason: s.alive && s.uuid !== executedUuid ? null : "EXECUTION",
          goldReward: 0,
        })),
      },
      resultClosesAt: resultClosesAt ?? now() + 180_000,
    }
  }
  t.resolve = async (outcome, options = {}) => {
    const payload = t.resolvedPayload(outcome, options)
    if (outcome === "GUILTY") seats[t.defendantIndex].alive = false
    if (outcome === "CANCELLED" || outcome === "DEFENDANT_DIED") seats[t.defendantIndex].alive = false
    t.phase = options.ended ? "ENDED" : "NIGHT"
    t.tribunalDeadline = null
    await t.say("tribunal_vote_resolved", payload)
    return payload
  }

  // 사람이 판에서 빠짐 (서버 buildDisconnectPayload 모양, 재판 중 피고가 나가면 단계는 밤)
  t.eliminatedPayload = (index, { phase = t.phase } = {}) => {
    const players = seats.map((s, i) => ({ uuid: s.uuid, alive: i === index ? false : s.alive }))
    return {
      gameId: t.gameId,
      phase,
      dayIndex: t.dayIndex,
      players,
      victimUuid: seats[index].uuid,
      sfxEvent: { eventId: `game:${t.gameId}:day:${t.dayIndex}:victim:${seats[index].uuid}:eliminated`, gameId: t.gameId, origin: "live" },
    }
  }
  t.eliminate = async (index, options = {}) => {
    const payload = t.eliminatedPayload(index, options)
    seats[index].alive = false
    await t.say("player_eliminated", payload)
    return payload
  }

  // 밤 끝 → 새 낮 (서버 buildNightResultAppliedPayload 모양), victim: 밤에 죽은 자리
  t.nextDay = async ({ victim = null, vote = true } = {}) => {
    if (victim !== null) seats[victim].alive = false
    t.dayIndex += 1
    t.phase = "DAY"
    t.dayPhase = "DAY_DISCUSSION"
    t.defendantIndex = null
    await t.say("night_result_applied", {
      gameId: t.gameId,
      phase: "DAY",
      dayIndex: t.dayIndex,
      players: seats.map((s) => ({ uuid: s.uuid, alive: s.alive })),
      victimUuid: victim === null ? null : seats[victim].uuid,
      deathReveals: victim === null ? [] : [{ victimUuid: seats[victim].uuid, source: "JOKER" }],
      dayPhaseDeadline: now() + 60_000,
    })
    if (vote) await t.toVote()
  }

  // 낮 토론 → 투표 (서버 buildDayPhaseChangedPayload 모양)
  t.toVote = async () => {
    t.dayPhase = "DAY_VOTE"
    await t.say("day_phase_changed", {
      gameId: t.gameId,
      dayIndex: t.dayIndex,
      dayPhase: "DAY_VOTE",
      round: 1,
      dayPhaseDeadline: now() + 60_000,
    })
  }

  // 표가 다 차 마감 5초 당김 (서버 phase_settle_started 모양)
  t.settlePayload = ({ phase = "TRIBUNAL", dayIndex = t.dayIndex, gameId = t.gameId, ms = 5_000 } = {}) => ({
    gameId, phase, dayIndex, role: null, deadline: now() + ms,
  })
  t.settle = async (options = {}) => {
    const payload = t.settlePayload(options)
    if ((options.phase ?? "TRIBUNAL") === "TRIBUNAL") t.tribunalDeadline = payload.deadline
    await t.say("phase_settle_started", payload)
    return payload
  }

  // 다른 사람 끊김·다시 붙음 (서버 session_player_connection_changed 모양)
  t.connection = async (index, isConnected) => {
    seats[index].connected = isConnected
    await t.say("session_player_connection_changed", { gameId: t.gameId, uuid: seats[index].uuid, isConnected })
  }

  // 밤 차례 시작 (서버 night_turn_started 모양)
  t.nightTurn = async (role = "JOKER", { seconds = 30 } = {}) => {
    const payload = { gameId: t.gameId, dayIndex: t.dayIndex, role, deadline: now() + seconds * 1000 }
    await t.say("night_turn_started", payload)
    return payload
  }

  // 새로고침: 화면 판 값을 비우고 서버 스냅샷으로 다시 채움 (화면은 그대로 둠)
  t.reload = async (over = {}) => {
    await RTL.act(async () => {
      useInGameStore.getState().clearGame()
      useInGameStore.getState().bootstrapSessionSnapshot(t.snapshot(over), null)
    })
  }

  // 판이 있을 때 스냅샷 받기 (다시 붙었을 때 화면이 묻고 받는 길)
  t.applySnapshot = async (over = {}) => {
    await RTL.act(async () => {
      useInGameStore.getState().applySessionSnapshot(t.snapshot(over), null)
    })
  }

  // 재판 표 성공 답 (서버 cast_tribunal_vote 답 모양)
  t.voteOk = (vote, { dayIndex = t.dayIndex } = {}) => ({ ok: true, gameId: t.gameId, dayIndex, vote })
}

// 가짜 시계 켜기 (setTimeout + Date), 화면 그리기 전에 부름
export function useFakeClock(now = 1_800_000_000_000) {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now })
}

// 가짜 시계 넘기기 (화면 바뀜까지)
export async function tick(ms) {
  await RTL.act(async () => {
    mock.timers.tick(ms)
  })
}

// 시험 하나 끝날 때: 화면 내림 → 시계 풂 → 판·로그인·소켓·탭 저장소 비움
export function resetTable() {
  const renderError = current?.renderError ?? null
  RTL.cleanup()
  mock.timers.reset()
  useInGameStore.getState().clearGame()
  useInGameStore.setState({ snapshotSeq: 0 })
  useAuthStore.getState().logout()
  setSocket(null)
  try {
    globalThis.window?.sessionStorage?.clear()
  } catch {
    // 탭 저장소가 막힌 환경이면 그냥 둠
  }
  current = null
  // 시험 도중 화면이 터졌으면 그 시험을 실패로
  if (renderError) throw renderError
}

// 지금 열린 판 (도우미 바깥에서 쓸 일 거의 없음)
export const currentTable = () => current
