import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket } from "@/shared/socket/socketClient.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "../../ingame/store/ingameStore.js"
import { createSessionEndFinalizer } from "../../ingame/utils/createSessionEndFinalizer.js"
import { createGameResultExitRequest } from "../utils/createGameResultExitRequest.js"

/**
 * 결과 화면의 "로비로" 버튼 핸들러를 만든다 — 소켓·store·finalizer 배선만 담당한다.
 *
 * useInGameExit의 배선을 그대로 따르되 createExitConfirmController(확인 대화상자)는 끼우지
 * 않는다 — 게임이 이미 끝난 화면이라 "정말 나가시겠습니까?"로 물을 대상이 없다. 같은 이유로
 * useBlocker(뒤로가기 가로채기)도 붙이지 않는다.
 *
 * 세션 정리는 새로 만들지 않고 createSessionEndFinalizer를 재사용한다 — clearGame이
 * state를 통째로 null로 되돌리므로 state.winResult도 함께 정리된다.
 *
 * @flow useMemo로 요청 함수를 navigate당 한 번만 만들어, 리렌더를 건너 중복 emit 가드가
 *   유지되게 한다.
 */
export function useGameResultLobbyExit() {
  const navigate = useNavigate()

  return useMemo(
    () =>
      createGameResultExitRequest({
        getSocket,
        getCurrentGameId: () => useInGameStore.getState().gameId,
        finalize: createSessionEndFinalizer({
          clearGame: () => useInGameStore.getState().clearGame(),
          clearRoom: () => useMatchingStore.getState().clearRoom(),
          navigate,
        }),
      }),
    [navigate],
  )
}
