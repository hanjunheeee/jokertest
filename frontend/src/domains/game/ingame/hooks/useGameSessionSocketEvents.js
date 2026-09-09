import { useEffect, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
// 상대 경로로 둔다 — 이 훅은 node:test에서 실제로 마운트해 검증하는 대상이고(store/__tests__/
// nightPrivateResult.test.js), `@/` 별칭은 vite만 해석할 수 있어 그 실행을 막는다.
import { useMatchingStore } from "../../matching/store/matchingStore.js"
import { useInGameStore } from "../store/ingameStore.js"
import { createGameEndedHandler } from "../utils/createGameEndedHandler.js"
import { createSessionEndFinalizer } from "../utils/createSessionEndFinalizer.js"
import { createSelfDisconnectHandler } from "../utils/createSelfDisconnectHandler.js"
import { parseNightResultAppliedPayload } from "../utils/parseNightResultAppliedPayload.js"
import { parseInGameNightPrivateResultPayload } from "../utils/reduceInGameNightPrivateResult.js"
import { selectInGameSelfAlive } from "../utils/selectInGameSelfAlive.js"
import { parseDayPhaseChangedPayload } from "../utils/parseDayPhaseChangedPayload.js"
import { parseNightTurnStartedPayload } from "../utils/parseNightTurnStartedPayload.js"
import { parseNightTurnEndedPayload } from "../utils/parseNightTurnEndedPayload.js"
import { attachNightTurnSocketListeners } from "../utils/attachNightTurnSocketListeners.js"
import { parseDayVoteResolvedPayload } from "./useInGameActionPanel.js"

/** 인게임 store와 matching store를 함께 초기화하고 로비로 이동하는 finalizer를 만든다. */
function buildFinalizer(navigate) {
  return createSessionEndFinalizer({
    clearGame: () => useInGameStore.getState().clearGame(),
    clearRoom: () => useMatchingStore.getState().clearRoom(),
    navigate,
  })
}

/**
 * GameSession이 서버에서 종료되면(game_ended, 또는 자신의 disconnect) 정리하고 /multiplay로
 * 돌아간다. ProtectedRoute에서 호출되어 로그인 상태가 유지되는 동안 라우트 전환과 무관하게
 * 계속 구독을 유지한다 — /ingame 마운트 시점에만 구독하면 game_started 이후
 * /ingame effect 등록 전 사이 구간에 도착하는 game_ended를 놓칠 수 있다.
 */
export function useGameSessionSocketEvents() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  // disconnect 리스너가 등록 시점의 gameId를 캡처해야 하므로(createSelfDisconnectHandler
  // 참고) 구독 대상으로 필요하다 — game_ended/phase_changed 핸들러는 호출 시점에 store를
  // 직접 다시 읽으므로 이 값에 의존하지 않는다.
  const gameId = useInGameStore((s) => s.gameId)

  useEffect(() => {
    if (!socket) return
    const finalize = buildFinalizer(navigate)
    const handleGameEnded = createGameEndedHandler({
      // 클로저로 렌더 시점 gameId를 캡처하지 않고, 이벤트가 실제로 도착한 시점에
      // store에서 최신 gameId를 읽는다 — stale(늦게 도착한 이전 세션) game_ended가
      // 그 사이 시작된 새 GameSession을 잘못 지우는 것을 막는다.
      getCurrentGameId: () => useInGameStore.getState().gameId,
      finalize,
    })
    // ROLE_REVEAL→NIGHT 전이 방송이다. game_ended와 같은 이유로 이 effect 안에서 함께
    // 구독한다 — /ingame 마운트 시점에만 구독하면 그 전(라우트 전환 중)에 도착하는
    // 이벤트를 놓칠 수 있다. applyPhaseChanged 자체가 gameId 불일치를 걸러내므로 여기서는
    // store에 그대로 위임한다.
    const handlePhaseChanged = (payload) => {
      useInGameStore.getState().applyPhaseChanged(payload)
    }

    // NIGHT 결과 적용(사망 + DAY 전이) 방송이다. 검증에 필요한 canonical roster/gameId/dayIndex는
    // 호출 시점의 store에서 직접 읽는다(렌더 시점 클로저를 캡처하지 않음 — 위 handleGameEnded와
    // 동일한 이유). 파서를 통과한 값만 store action으로 넘긴다.
    const handleNightResultApplied = (payload) => {
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const canonicalPlayerIds = new Set((current.state.players ?? []).map((p) => p.uuid))
      const previouslyDeadUuids = new Set((current.state.players ?? []).filter((p) => p.alive === false).map((p) => p.uuid))
      const parsed = parseNightResultAppliedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        canonicalPlayerIds,
        previouslyDeadUuids,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightResultAppliedPayload(parsed)
    }

    // 밤 개인 결과(night_action_result)다. 세션 channel 방송이 아니라 결과가 있는 수신자
    // 소켓에게만 개별 emit되는 1회성 통지이고, payload에는 수신자 identity가 없다 — 그래서
    // 본인 확인은 서버가 그 결과를 만들 수 있는 수신자 조건(역할·생존·대상≠본인) 전부와
    // 대조해서 한다(parseInGameNightPrivateResultPayload).
    // 검증에 필요한 gameId/dayIndex/phase/self는 호출 시점의 store에서 직접 읽는다(위
    // handleNightResultApplied와 동일한 이유 — 렌더 시점 클로저를 캡처하지 않는다).
    const handleNightActionResult = (payload) => {
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseInGameNightPrivateResultPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        phase: current.state.phase,
        selfRole: current.state.self?.role ?? null,
        selfUuid: current.state.self?.uuid ?? null,
        // 생존은 roster가 유일한 canonical 출처다(self에는 alive가 없다 — selectInGameSelfAlive).
        selfAlive: selectInGameSelfAlive(current.state),
      })
      if (!parsed) return
      useInGameStore.getState().setNightPrivateResult(parsed)
    }

    // DAY 투표 판정 방송이다(TRIBUNAL 전이 또는 TIE/ABSTAINED의 NIGHT 전이). 검증에 필요한
    // gameId/dayIndex는 호출 시점의 store에서 직접 읽는다(위 handleNightResultApplied와 동일한 이유).
    const handleDayVoteResolved = (payload) => {
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseDayVoteResolvedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore
        .getState()
        .applyDayVoteResolvedToPhase(current.gameId, parsed.dayIndex, {
          ...parsed,
          outcome: parsed.outcome,
          defendantUuid: parsed.tribunalTargetUuid,
        })
    }

    // 낮 하위 페이즈 전이(DAY_DISCUSSION→DAY_VOTE) 방송이다. 검증에 필요한 gameId/dayIndex는
    // 호출 시점의 store에서 직접 읽는다(위 handleNightResultApplied와 동일한 이유).
    const handleDayPhaseChanged = (payload) => {
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseDayPhaseChangedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore.getState().applyDayPhaseChanged(parsed)
    }

    // 밤 역할 턴 전이(어느 직업의 차례가 시작됐는가) 방송이다. 검증에 필요한 gameId/dayIndex는
    // 호출 시점의 store에서 직접 읽는다(위 handleNightResultApplied와 동일한 이유).
    //
    // 이 구독은 역할·생존과 무관하게 모든 참가자에게 똑같이 걸린다 — 서버도 생존자가 없는
    // 역할의 턴을 똑같이 돌리고 같은 payload를 세션 channel 전체에 방송하므로, 여기서 역할별·
    // 생존별로 나눠 구독하면 죽은 직업의 턴 안내만 조용히 사라진다.
    const handleNightTurnStarted = (payload) => {
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseNightTurnStartedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightTurnStarted(parsed)
    }

    // 서버가 현재 역할 턴의 종료를 확정한 순간 role/deadline을 함께 비운다. 다음 started가
    // 오기 전의 공백도 서버 상태의 일부이므로 이전 역할을 로컬에서 유지하거나 추정하지 않는다.
    const handleNightTurnEnded = (payload) => {
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseNightTurnEndedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        nightTurnRole: current.state.nightTurnRole,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightTurnEnded(parsed)
    }

    const detachNightTurnListeners = attachNightTurnSocketListeners(socket, {
      onStarted: handleNightTurnStarted,
      onEnded: handleNightTurnEnded,
    })

    // TRIBUNAL 판정 완료 방송이다. 위 세 핸들러와 달리 별도 파서를 거치지 않고 raw payload를
    // 그대로 store에 넘긴다 — applyTribunalResolved(→applyTribunalResolvedPure)가 gameId/
    // dayIndex/phase/defendantUuid 4종을 canonical과 비교해 stale이면 참조를 그대로 보존한다.
    const handleTribunalVoteResolved = (payload) => {
      useInGameStore.getState().applyTribunalResolved(payload)
    }

    socket.on("game_ended", handleGameEnded)
    socket.on("game_phase_changed", handlePhaseChanged)
    socket.on("night_result_applied", handleNightResultApplied)
    socket.on("night_action_result", handleNightActionResult)
    socket.on("day_vote_resolved", handleDayVoteResolved)
    socket.on("day_phase_changed", handleDayPhaseChanged)
    socket.on("tribunal_vote_resolved", handleTribunalVoteResolved)
    return () => {
      socket.off("game_ended", handleGameEnded)
      socket.off("game_phase_changed", handlePhaseChanged)
      socket.off("night_result_applied", handleNightResultApplied)
      socket.off("night_action_result", handleNightActionResult)
      socket.off("day_vote_resolved", handleDayVoteResolved)
      socket.off("day_phase_changed", handleDayPhaseChanged)
      detachNightTurnListeners()
      socket.off("tribunal_vote_resolved", handleTribunalVoteResolved)
    }
  }, [socket, navigate])

  useEffect(() => {
    // 활성 GameSession이 없으면(gameId 없음) disconnect가 와도 정리할 것이 없다 — 로비 등
    // 인게임 밖에서 발생하는 일반적인 재연결까지 이 경로가 반응할 필요는 없다.
    if (!socket || !gameId) return
    const finalize = buildFinalizer(navigate)
    const handleSelfDisconnect = createSelfDisconnectHandler({
      getActiveSocket: getSocket,
      registeredSocket: socket,
      registeredGameId: gameId,
      getCurrentGameId: () => useInGameStore.getState().gameId,
      finalize,
    })

    socket.on("disconnect", handleSelfDisconnect)
    return () => socket.off("disconnect", handleSelfDisconnect)
  }, [socket, gameId, navigate])
}
