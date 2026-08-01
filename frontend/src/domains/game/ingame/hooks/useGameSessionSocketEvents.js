import { useEffect, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "../store/ingameStore.js"
import { createGameEndedHandler } from "../utils/createGameEndedHandler.js"
import { createSessionEndFinalizer } from "../utils/createSessionEndFinalizer.js"
import { createSelfDisconnectHandler } from "../utils/createSelfDisconnectHandler.js"
import { parseNightResultAppliedPayload } from "../utils/parseNightResultAppliedPayload.js"

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
      const parsed = parseNightResultAppliedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        canonicalPlayerIds,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightResultAppliedPayload(parsed)
    }

    socket.on("game_ended", handleGameEnded)
    socket.on("game_phase_changed", handlePhaseChanged)
    socket.on("night_result_applied", handleNightResultApplied)
    return () => {
      socket.off("game_ended", handleGameEnded)
      socket.off("game_phase_changed", handlePhaseChanged)
      socket.off("night_result_applied", handleNightResultApplied)
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
