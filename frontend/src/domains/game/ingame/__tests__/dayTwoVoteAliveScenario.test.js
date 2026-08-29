import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { act, renderHook } from "@testing-library/react"
import { JSDOM } from "jsdom"
import { InGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import { useInGameActionPanel } from "../hooks/useInGameActionPanel.js"
import { useInGameStore } from "../store/ingameStore.js"
import { setSocket } from "../../../../shared/socket/socketClient.js"
import { buildPlayerSessionSourceFromGameState } from "../utils/buildPlayerSessionSourceFromGameState.js"
import { buildInGamePreviewPlayers } from "../utils/buildInGamePreviewPlayers.js"
import { mergeSourcePlayerWithPreview } from "../utils/mergeSourcePlayerWithPreview.js"
import { selectInGameSelfAlive } from "../utils/selectInGameSelfAlive.js"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"

// ---------------------------------------------------------------------------
// AC-03 · 1일차 재판 → 밤 판정 → 2일차 낮 통합 시나리오
//
// canonical 이벤트를 순서대로 store에 태운 뒤, 계정별로 조작 패널을 렌더해 2일차 낮
// 투표를 실제로 수행할 수 있는지 본다. 생존 계정은 투표가 서버로 나가고(cast_day_vote),
// 1일차에 처형된 계정과 그 밤에 사망한 계정은 UI 게이트에서 막혀 아무것도 나가지 않는다.
// ---------------------------------------------------------------------------

const GAME_ID = "game-1"
const EXECUTED_UUID = "u3" // 1일차 재판에서 처형된다.
const NIGHT_VICTIM_UUID = "u2" // 그 밤에 사망한다.

const ROSTER = [
  { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN" },
  { uuid: "u2", nickname: "B", role: "DOCTOR", team: "CITIZEN" },
  { uuid: "u3", nickname: "C", role: "GUARD", team: "CITIZEN" },
  { uuid: "u4", nickname: "D", role: "WITCH_HUNTER", team: "CITIZEN" },
]

const DAY_TWO_ALIVE_BY_UUID = { u1: true, u2: false, u3: false, u4: true }

let scenarioDom = null

function ensureClientEnvironment() {
  if (globalThis.document?.body) return

  scenarioDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
  globalThis.window = scenarioDom.window
  globalThis.document = scenarioDom.window.document
  globalThis.HTMLElement = scenarioDom.window.HTMLElement
  globalThis.Node = scenarioDom.window.Node
  globalThis.MutationObserver = scenarioDom.window.MutationObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

/** 제출이 실제로 서버로 나갔는지 관찰하기 위한 최소 socket 스텁. */
function createFakeSocket() {
  const emitted = []
  const socket = {
    connected: true,
    on() {},
    off() {},
    emitWithAck(event, payload) {
      emitted.push({ event, payload })
      return Promise.resolve({ ok: true })
    },
    timeout() {
      return { emitWithAck: (event, payload) => socket.emitWithAck(event, payload) }
    },
  }
  return { socket, emitted }
}

function seedStartedSession(selfUuid) {
  const selfEntry = ROSTER.find((player) => player.uuid === selfUuid)
  useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
  useInGameStore.getState().setGamePayload({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase: "ROLE_REVEAL",
      dayIndex: 0,
      players: ROSTER.map((player, index) => ({
        uuid: player.uuid,
        nickname: player.nickname,
        themeIndex: index,
      })),
      self: {
        uuid: selfEntry.uuid,
        nickname: selfEntry.nickname,
        role: selfEntry.role,
        team: selfEntry.team,
        hasActedThisPhase: false,
      },
    },
  })
}

/** 1일차 낮 투표 → 재판 처형 → 밤 사망 → 2일차 낮 투표까지의 canonical 이벤트 순서. */
const DAY_TWO_EVENT_STEPS = [
  ["1일차 낮 진입", (store) => store.applyPhaseChanged({ gameId: GAME_ID, phase: "DAY", dayIndex: 1 })],
  ["1일차 투표 개시", (store) => store.applyDayPhaseChanged({ gameId: GAME_ID, dayIndex: 1, dayPhase: "DAY_VOTE" })],
  [
    "1일차 투표 판정(TRIBUNAL)",
    (store) => store.applyDayVoteResolvedToPhase(GAME_ID, 1, { outcome: "TRIBUNAL", defendantUuid: EXECUTED_UUID }),
  ],
  [
    "재판 판정(GUILTY → 처형 후 밤)",
    (store) =>
      store.applyTribunalResolved({
        gameId: GAME_ID,
        dayIndex: 1,
        phase: "NIGHT",
        defendantUuid: EXECUTED_UUID,
        outcome: "GUILTY",
        counts: { guilty: 3, notGuilty: 1 },
        executedUuid: EXECUTED_UUID,
      }),
  ],
  [
    "밤 판정 반영(2일차 낮 전이)",
    (store) =>
      store.applyNightResultAppliedPayload({
        gameId: GAME_ID,
        phase: "DAY",
        dayIndex: 2,
        victimUuid: NIGHT_VICTIM_UUID,
        players: ROSTER.map((player) => ({ uuid: player.uuid, alive: DAY_TWO_ALIVE_BY_UUID[player.uuid] })),
      }),
  ],
  ["2일차 투표 개시", (store) => store.applyDayPhaseChanged({ gameId: GAME_ID, dayIndex: 2, dayPhase: "DAY_VOTE" })],
]

function runDayTwoEventSequence() {
  for (const [, apply] of DAY_TWO_EVENT_STEPS) {
    apply(useInGameStore.getState())
  }
}

/**
 * InGamePlayerSessionProvider가 store에서 세션 컨텍스트를 만드는 방식(useInGamePlayerSession)을
 * 그대로 재현한다 — .jsx 컴포넌트를 이 테스트에서 직접 렌더할 수 없어 같은 유틸 조합으로 만든다.
 * 서버 상태가 검증을 통과하지 못하면 실제 화면과 동일하게 preview(더미) 목록으로 떨어진다.
 */
function buildSessionContextFromStore() {
  const { sourcePlayers, localPlayerId } = buildPlayerSessionSourceFromGameState(useInGameStore.getState().state)
  const previewPlayers = buildInGamePreviewPlayers(sourcePlayers?.length ?? INGAME_PREVIEW_PLAYER_COUNT)
  const players = sourcePlayers?.length
    ? sourcePlayers.map((player, index) => mergeSourcePlayerWithPreview(player, previewPlayers[index]))
    : previewPlayers

  return { players, localPlayerId }
}

function renderPanel(contextValue) {
  ensureClientEnvironment()

  function Wrapper({ children }) {
    return React.createElement(InGamePlayerSessionContext.Provider, { value: contextValue }, children)
  }

  return renderHook(() => useInGameActionPanel(), { wrapper: Wrapper })
}

/**
 * InGameActionPanel의 투표 버튼 disabled 규칙을 그대로 따라 "화면에서 투표를 수행"한다.
 * 버튼이 잠겨 있으면 제출 함수를 호출하지 않는다 — 실제 사용자가 할 수 있는 일만 한다.
 */
async function voteThroughUi(rendered, targetId) {
  await act(async () => {
    rendered.result.current.setSelectedDayVoteTargetId(targetId)
  })

  const panel = rendered.result.current
  const voteButtonDisabled =
    !panel.selectedDayVoteTargetId || !panel.dayVoteControlsEnabled || panel.dayVoteStatus === "submitting"
  if (voteButtonDisabled) return false

  await act(async () => {
    panel.submitDayVote()
  })
  return true
}

test("2일차 낮: 생존 계정은 투표를 수행해 cast_day_vote가 서버로 나간다", async () => {
  const { socket, emitted } = createFakeSocket()
  setSocket(socket)
  seedStartedSession("u1")
  runDayTwoEventSequence()

  const rendered = renderPanel(buildSessionContextFromStore())

  assert.equal(selectInGameSelfAlive(useInGameStore.getState().state), true)
  assert.equal(rendered.result.current.dayVoteControlsEnabled, true)
  // 사망자는 투표 대상 목록에서도 빠진다 — 남은 생존자(u4)만 고를 수 있다.
  assert.deepEqual(
    rendered.result.current.dayVoteTargets.map((target) => target.id),
    ["u4"],
  )

  const voted = await voteThroughUi(rendered, "u4")
  rendered.unmount()
  setSocket(null)

  assert.equal(voted, true)
  const dayVoteEmits = emitted.filter((entry) => entry.event === "cast_day_vote")
  assert.equal(dayVoteEmits.length, 1)
  assert.deepEqual(dayVoteEmits[0].payload, { gameId: GAME_ID, dayIndex: 2, targetId: "u4" })
})

for (const [label, deadUuid] of [
  ["1일차 재판에서 처형된", EXECUTED_UUID],
  ["1일차 밤에 사망한", NIGHT_VICTIM_UUID],
]) {
  test(`2일차 낮: ${label} 계정은 투표를 수행할 수 없고 아무것도 서버로 나가지 않는다`, async () => {
    const { socket, emitted } = createFakeSocket()
    setSocket(socket)
    seedStartedSession(deadUuid)
    runDayTwoEventSequence()

    const rendered = renderPanel(buildSessionContextFromStore())

    assert.equal(selectInGameSelfAlive(useInGameStore.getState().state), false)
    assert.equal(rendered.result.current.dayVoteControlsEnabled, false)

    const voted = await voteThroughUi(rendered, "u4")
    rendered.unmount()
    setSocket(null)

    assert.equal(voted, false)
    assert.deepEqual(
      emitted.filter((entry) => entry.event === "cast_day_vote"),
      [],
    )
  })
}

test("2일차 낮: 서버 상태가 세션 목록으로 변환되지 못해 프리뷰로 떨어져도 사망 계정의 투표는 열리지 않는다", async () => {
  const { socket, emitted } = createFakeSocket()
  setSocket(socket)
  seedStartedSession(NIGHT_VICTIM_UUID)
  runDayTwoEventSequence()

  // themeIndex가 없는 상태(예: 표시 색상을 잇지 못한 복원 경로)에서는
  // buildPlayerSessionSourceFromGameState가 fail-closed로 preview 목록을 돌려준다 — 그러면
  // 세션 컨텍스트에는 본인 항목 자체가 없어 예전 게이트는 생존으로 취급했다.
  const state = useInGameStore.getState().state
  useInGameStore.setState({
    state: {
      ...state,
      players: state.players.map((player) => ({ uuid: player.uuid, nickname: player.nickname, alive: player.alive })),
    },
  })
  const sessionContext = buildSessionContextFromStore()
  assert.equal(sessionContext.localPlayerId, null)

  const rendered = renderPanel(sessionContext)

  assert.equal(selectInGameSelfAlive(useInGameStore.getState().state), false)
  assert.equal(rendered.result.current.dayVoteControlsEnabled, false)

  const voted = await voteThroughUi(rendered, "u4")
  rendered.unmount()
  setSocket(null)

  assert.equal(voted, false)
  assert.deepEqual(
    emitted.filter((entry) => entry.event === "cast_day_vote"),
    [],
  )
})

test("단계별 생존 상태: 각 이벤트 직후 계정별 self 생존 판정이 기대와 일치한다", () => {
  // [단계 이름, 그 직후의 계정별 기대 생존 상태] — 어긋남이 생기면 어느 전이에서 갈렸는지 특정된다.
  const expectedAfterStep = [
    { u1: true, u2: true, u3: true, u4: true }, // 1일차 낮 진입
    { u1: true, u2: true, u3: true, u4: true }, // 1일차 투표 개시
    { u1: true, u2: true, u3: true, u4: true }, // TRIBUNAL 판정(아직 처형 전)
    { u1: true, u2: true, u3: false, u4: true }, // 재판 GUILTY → u3 처형
    { u1: true, u2: false, u3: false, u4: true }, // 밤 사망 반영 → u2 사망
    { u1: true, u2: false, u3: false, u4: true }, // 2일차 투표 개시
  ]

  for (const { uuid } of ROSTER) {
    seedStartedSession(uuid)
    assert.equal(selectInGameSelfAlive(useInGameStore.getState().state), true, `${uuid}: 게임 시작 직후`)

    DAY_TWO_EVENT_STEPS.forEach(([label, apply], index) => {
      apply(useInGameStore.getState())
      assert.equal(
        selectInGameSelfAlive(useInGameStore.getState().state),
        expectedAfterStep[index][uuid],
        `${uuid}: ${label} 직후`,
      )
    })
  }
})
