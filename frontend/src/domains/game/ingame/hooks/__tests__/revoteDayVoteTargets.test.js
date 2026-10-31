import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { JSDOM } from "jsdom"
import { act, renderHook } from "@testing-library/react"
import { useInGameActionPanel } from "../useInGameActionPanel.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { InGamePlayerSessionContext } from "../../components/InGamePlayerSessionContext.js"
import { buildDayVoteTargets } from "../../utils/buildDayVoteTargets.js"
import { getDayVoteRound } from "../../utils/dayVoteRound.js"
import { INGAME_PLAYER_STATUS } from "../../constants/board/status/ingamePlayerStatus.js"
import { setSocket } from "../../../../../shared/socket/socketClient.js"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
for (const name of ["window", "document", "HTMLElement", "Node", "MutationObserver"]) {
  globalThis[name] = name === "window" ? dom.window : dom.window[name]
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const GAME_ID = "g"
const LOCAL_PLAYER_ID = "p1"
const ROSTER = ["p1", "p2", "p3", "p4", "p5"]
const REVOTE_EXCLUDED = ["p2", "p3"]
const EXECUTED_UUID = "p4"

function buildSessionPlayers() {
  return (useInGameStore.getState().state?.players ?? []).map((player) => ({
    id: player.uuid,
    nickname: player.nickname,
    status: player.alive === false ? INGAME_PLAYER_STATUS.DEAD : INGAME_PLAYER_STATUS.ALIVE,
  }))
}

function seedDayOneVote() {
  useInGameStore.setState({
    gameId: GAME_ID,
    error: null,
    state: {
      id: GAME_ID,
      phase: "DAY",
      dayPhase: "DAY_VOTE",
      dayIndex: 1,
      dayVoteRound: 1,
      dayVoteExcludedUuids: [],
      players: ROSTER.map((uuid) => ({ uuid, nickname: uuid, alive: true })),
      self: { uuid: LOCAL_PLAYER_ID, role: "CITIZEN" },
    },
  })
}

function expectedTargets(sessionPlayers) {
  return buildDayVoteTargets(sessionPlayers, {
    localPlayerId: LOCAL_PLAYER_ID,
    excludedUuids: useInGameStore.getState().state?.dayVoteExcludedUuids ?? [],
  })
}

test("동률→재투표→처형: 패널이 쓰는 대상 목록은 매 라운드 buildDayVoteTargets 결과와 같다", () => {
  setSocket(null)
  seedDayOneVote()

  const sessionRef = { current: { players: buildSessionPlayers(), localPlayerId: LOCAL_PLAYER_ID } }
  function Wrapper({ children }) {
    return React.createElement(InGamePlayerSessionContext.Provider, { value: sessionRef.current }, children)
  }

  const hook = renderHook(() => useInGameActionPanel(), { wrapper: Wrapper })

  const syncSession = () => {
    sessionRef.current = { players: buildSessionPlayers(), localPlayerId: LOCAL_PLAYER_ID }
    act(() => hook.rerender())
  }

  try {
    assert.equal(getDayVoteRound(useInGameStore.getState().state), 1)
    assert.deepEqual(hook.result.current.dayVoteTargets, expectedTargets(sessionRef.current.players))
    assert.deepEqual(hook.result.current.dayVoteTargets.map((t) => t.id), ["p2", "p3", "p4", "p5"])

    act(() => hook.result.current.setSelectedDayVoteTargetId("p5"))
    act(() => {
      useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, {
        outcome: "REVOTE",
        round: 1,
        revoteExcludedUuids: REVOTE_EXCLUDED,
        publicVoteCount: 5,
        publicAbstainCount: 0,
      })
    })
    syncSession()

    assert.equal(getDayVoteRound(useInGameStore.getState().state), 2)
    assert.equal(hook.result.current.selectedDayVoteTargetId, null)
    assert.deepEqual(hook.result.current.dayVoteTargets, expectedTargets(sessionRef.current.players))
    assert.deepEqual(hook.result.current.dayVoteTargets.map((t) => t.id), ["p4", "p5"])

    act(() => {
      useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, {
        outcome: "TRIBUNAL",
        round: 2,
        defendantUuid: EXECUTED_UUID,
        publicVoteCount: 4,
        publicAbstainCount: 0,
      })
    })
    assert.equal(useInGameStore.getState().state.phase, "TRIBUNAL")

    act(() => {
      useInGameStore.getState().applyTribunalResolved({
        gameId: GAME_ID,
        dayIndex: 1,
        phase: "NIGHT",
        defendantUuid: EXECUTED_UUID,
        outcome: "GUILTY",
        counts: { guilty: 3, notGuilty: 1 },
        executedUuid: EXECUTED_UUID,
      })
    })
    assert.equal(useInGameStore.getState().state.phase, "NIGHT")

    act(() => {
      useInGameStore.getState().applyNightResultAppliedPayload({
        gameId: GAME_ID,
        phase: "DAY",
        dayIndex: 2,
        victimUuid: null,
        players: ROSTER.map((uuid) => ({ uuid, alive: uuid !== EXECUTED_UUID })),
      })
      useInGameStore.getState().applyDayPhaseChanged({ gameId: GAME_ID, dayIndex: 2, dayPhase: "DAY_VOTE" })
    })
    syncSession()

    assert.deepEqual(useInGameStore.getState().state.dayVoteExcludedUuids, [])
    assert.equal(getDayVoteRound(useInGameStore.getState().state), 1)
    assert.deepEqual(hook.result.current.dayVoteTargets, expectedTargets(sessionRef.current.players))
    assert.deepEqual(hook.result.current.dayVoteTargets.map((t) => t.id), ["p2", "p3", "p5"])
  } finally {
    hook.unmount()
    setSocket(null)
  }
})
