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

// ---------------------------------------------------------------------------
// AC-04 · 동률 → 재투표 → 처형 시나리오
//
// 이식된 컨트롤 패널은 대상 후보를 스스로 다시 계산하지 않고, 훅이 준 dayVoteTargets를
// 그대로 InGameTargetPicker에 넘긴다. 그 목록이 정말 buildDayVoteTargets의 결과와 같은지를
// 재투표 라운드마다 확인한다 — 화면이 자체 필터를 하나라도 끼워 넣으면(예: 동률 제외 대상을
// 다시 넣거나, 처형된 참가자를 남기거나) 여기서 곧바로 어긋난다.
//
// InGameActionPanel.jsx는 .jsx라 이 저장소의 node:test 실행이 직접 렌더할 수 없으므로,
// 패널이 실제로 구조 분해하는 훅 반환값(dayVoteTargets)을 판정 대상으로 삼는다.
// ---------------------------------------------------------------------------

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
for (const name of ["window", "document", "HTMLElement", "Node", "MutationObserver"]) {
  globalThis[name] = name === "window" ? dom.window : dom.window[name]
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const GAME_ID = "g"
const LOCAL_PLAYER_ID = "p1"
const ROSTER = ["p1", "p2", "p3", "p4", "p5"]
// 1차 투표가 동률로 끝나 재투표 대상이 되는 둘. 재투표에서는 이 둘만 남고 나머지가 빠진다
// (서버 revoteExcludedUuids는 "제외 대상"이 아니라 "이번 라운드에서 고를 수 없는 대상"이다).
const REVOTE_EXCLUDED = ["p2", "p3"]
const EXECUTED_UUID = "p4"

/** 실제 화면과 같은 세션 컨텍스트 모양({id, nickname, status})을 canonical state에서 만든다. */
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

/** 지금 canonical state를 그대로 넣었을 때 빌더가 만드는 대상 목록(= 화면의 기대값). */
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

  /** canonical state가 바뀐 뒤 세션 컨텍스트를 다시 만들어 화면과 같은 입력으로 재렌더한다. */
  const syncSession = () => {
    sessionRef.current = { players: buildSessionPlayers(), localPlayerId: LOCAL_PLAYER_ID }
    act(() => hook.rerender())
  }

  try {
    // 1라운드 — 아직 제외 대상이 없다. 본인만 빠진 생존자 전원.
    assert.equal(getDayVoteRound(useInGameStore.getState().state), 1)
    assert.deepEqual(hook.result.current.dayVoteTargets, expectedTargets(sessionRef.current.players))
    assert.deepEqual(hook.result.current.dayVoteTargets.map((t) => t.id), ["p2", "p3", "p4", "p5"])

    // 동률 → 재투표. 라운드가 올라가고 선택값이 초기화되며, 대상이 동률 대상 밖으로 좁혀진다.
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

    // 재투표 2라운드가 TRIBUNAL로 끝나고, 재판에서 유죄가 나 p4가 처형된다.
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

    // 그 밤이 지나고 2일차 낮 투표가 열린다 — 제외 목록은 비워지고, 처형된 p4는 사라진다.
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
