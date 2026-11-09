// 브라우저 시험 문제: 둘째 날 기권 잠김(인게임A 1)·재판 남은 시간 00:00(모바일 M-1)
// 새 낮에 지난 날 내 표 기록 지움·표 기록에 날짜 붙임, 재판 마감 시각을 판정·스냅샷에서 받아 시간 바에 씀
import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { act, renderHook } = await import("@testing-library/react")
const { useInGameStore } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { useInGameDayVoteSubmit } = await import("../../../../../src/domains/game/ingame/hooks/useInGameDayVoteSubmit.js")
const { selectInGameTimebarPhaseDeadline } = await import("../../../../../src/domains/game/ingame/utils/timebar/phaseDeadline.js")
const { applySessionSnapshotPure } = await import("../../../../../src/domains/game/ingame/utils/snapshot/applySnapshot.js")

const GAME_ID = "game-day2"
const PLAYERS = [
  { uuid: "u1", nickname: "A", alive: true, isConnected: true },
  { uuid: "u2", nickname: "B", alive: true, isConnected: true },
  { uuid: "u3", nickname: "C", alive: true, isConnected: true },
]

function seed(overrides = {}, selfOverrides = {}) {
  useInGameStore.getState().clearGame()
  useInGameStore.setState({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase: "DAY",
      dayIndex: 1,
      dayPhase: "DAY_VOTE",
      participationRevision: 0,
      players: PLAYERS.map((p) => ({ ...p })),
      self: { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false, ...selfOverrides },
      ...overrides,
    },
    error: null,
  })
}

const self = () => useInGameStore.getState().state.self

test("첫날 기권 기록은 둘째 날 낮이 되면 지워짐", () => {
  seed({ phase: "NIGHT", dayPhase: null }, { hasSubmittedDayVote: true, dayVoteTargetUuid: null, dayVoteRound: 1, dayVoteDayIndex: 1 })
  useInGameStore.getState().applyNightResultAppliedPayload({
    gameId: GAME_ID, phase: "DAY", dayIndex: 2, victimUuid: null,
    players: PLAYERS.map(({ uuid }) => ({ uuid, alive: true })),
  })
  assert.equal(useInGameStore.getState().state.dayIndex, 2)
  assert.equal(Object.hasOwn(self(), "hasSubmittedDayVote"), false)
  assert.equal(Object.hasOwn(self(), "dayVoteTargetUuid"), false)
  assert.equal(Object.hasOwn(self(), "dayVoteRound"), false)
  assert.equal(Object.hasOwn(self(), "dayVoteDayIndex"), false)
})

test("내 진행 받기: 낮 표 기록에 받은 날짜를 붙임", () => {
  seed()
  useInGameStore.getState().applySelfProgress({
    gameId: GAME_ID, phase: "DAY", dayIndex: 1, participationRevision: 0, selfProgressSeq: 1,
    self: { hasSubmittedDayVote: true, dayVoteTargetUuid: null, dayVoteRound: 1 },
  })
  assert.equal(self().hasSubmittedDayVote, true)
  assert.equal(self().dayVoteDayIndex, 1)
})

test("제출 훅: 서버 표 기록이 지난 날 것이면 안 믿음 (같은 회차 1이어도 둘째 날 기권 버튼 켜짐)", () => {
  seed({ dayIndex: 2 }, { hasSubmittedDayVote: true, dayVoteTargetUuid: null, dayVoteRound: 1, dayVoteDayIndex: 1 })
  const { result, unmount } = renderHook(() => useInGameDayVoteSubmit())
  assert.equal(result.current.hasSubmitted, false)
  unmount()

  seed({ dayIndex: 2 }, { hasSubmittedDayVote: true, dayVoteTargetUuid: "u2", dayVoteRound: 1, dayVoteDayIndex: 2 })
  const sameDay = renderHook(() => useInGameDayVoteSubmit())
  assert.equal(sameDay.result.current.hasSubmitted, true)
  assert.equal(sameDay.result.current.lastSubmittedTargetId, "u2")
  sameDay.unmount()
})

test("재판 마감: 낮 투표 판정에 실린 마감 시각을 받아 시간 바가 씀", () => {
  seed()
  act(() => {
    useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, {
      outcome: "TRIBUNAL", defendantUuid: "u2", round: 1, tribunalDeadline: 123456,
      publicVoteCount: 3, publicAbstainCount: 0,
    })
  })
  const state = useInGameStore.getState().state
  assert.equal(state.phase, "TRIBUNAL")
  assert.equal(state.tribunalDeadline, 123456)
  assert.equal(selectInGameTimebarPhaseDeadline(state), 123456)
})

test("재판 마감: 판정에 마감이 없으면 옛 값 지움 (다른 날 재판 마감이 남지 않게)", () => {
  seed({ tribunalDeadline: 999 })
  useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, {
    outcome: "TRIBUNAL", defendantUuid: "u2", round: 1, publicVoteCount: 3, publicAbstainCount: 0,
  })
  assert.equal(useInGameStore.getState().state.tribunalDeadline, null)
})

test("재판 마감: 재판 중 스냅샷의 tribunalDeadline을 받음, 재판 아니면 안 씀", () => {
  const current = {
    gameId: GAME_ID,
    state: {
      id: GAME_ID, phase: "DAY", dayIndex: 1, players: PLAYERS.map((p) => ({ ...p })),
      self: { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    },
  }
  const response = {
    ok: true, gameId: GAME_ID, phase: "TRIBUNAL", dayIndex: 1,
    players: PLAYERS.map(({ uuid, nickname }) => ({ uuid, nickname, isAlive: true, isConnected: true })),
    self: { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "u2", publicVoteCount: 2, publicAbstainCount: 0 },
    tribunal: { defendantUuid: "u2", resolved: false },
    tribunalDeadline: 777000,
  }
  const applied = applySessionSnapshotPure(current, response)
  assert.equal(applied.state.phase, "TRIBUNAL", "스냅샷이 받아들여져야 함")
  assert.equal(applied.state.tribunalDeadline, 777000)
  assert.equal(selectInGameTimebarPhaseDeadline(applied.state), 777000)

  const rest = { ...response }
  delete rest.dayVoteResolution
  delete rest.tribunal
  const night = applySessionSnapshotPure({ ...current, ...applied }, { ...rest, phase: "NIGHT", tribunalDeadline: 777000 })
  assert.equal(night.state.phase, "NIGHT")
  assert.equal(night.state.tribunalDeadline, null)
})
