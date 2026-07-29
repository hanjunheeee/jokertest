import { useEffect } from "react"
import { useBlocker, useNavigate } from "react-router-dom"
import { getSocket } from "@/shared/socket/socketClient.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "../store/ingameStore.js"
import { createSessionEndFinalizer } from "../utils/createSessionEndFinalizer.js"
import { createLeaveGameSessionRequest } from "../utils/createLeaveGameSessionRequest.js"
import { createExitConfirmController } from "../utils/createExitConfirmController.js"
import { isPopNavigationBlocked } from "../utils/isPopNavigationBlocked.js"

/**
 * 인게임 나가기 버튼과 앱 내부 뒤로가기(POP)를 같은 확인·leave_game_session 계약으로
 * 묶는다. 둘 다 createExitConfirmController를 거치므로, 확인 대화상자를 취소하면 어느
 * 진입점에서도 인게임 화면에 남고 아무 이벤트도 전송되지 않는다.
 *
 * 성공 ack·game_ended에 따른 로비 이동은 finalize의 navigate(PUSH 아님, replace)로 이뤄지며
 * isPopNavigationBlocked는 POP만 가로채므로 그 이동 자체는 차단되지 않는다. 실제 탭
 * 종료·새로고침처럼 가로챌 수 없는 이탈은 여기서 다루지 않고 기존 disconnect
 * fallback(useGameSessionSocketEvents의 자신의 disconnect 처리)에 맡긴다.
 */
export function useInGameExit() {
  const navigate = useNavigate()
  const blocker = useBlocker(isPopNavigationBlocked)

  const requestExit = () => {
    const finalize = createSessionEndFinalizer({
      clearGame: () => useInGameStore.getState().clearGame(),
      clearRoom: () => useMatchingStore.getState().clearRoom(),
      navigate,
    })
    const requestLeave = createLeaveGameSessionRequest({
      getSocket,
      getCurrentGameId: () => useInGameStore.getState().gameId,
      finalize,
    })
    return createExitConfirmController({ confirm: window.confirm, requestLeave })()
  }

  useEffect(() => {
    if (blocker.state !== "blocked") return
    // 확인 여부와 무관하게 가로챈 POP 네비게이션 자체는 항상 취소한다 — 확인 시 실제 이동은
    // requestExit 내부의 finalize(navigate replace)가 별도로 수행하므로, blocker.proceed()로
    // 원래 뒤로가기 목적지(임의의 이전 화면)로 넘어가지 않게 한다.
    requestExit()
    blocker.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])

  return { requestExit }
}
