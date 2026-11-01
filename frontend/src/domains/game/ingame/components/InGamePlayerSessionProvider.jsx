// 플레이어 세션 Provider: 판 상태로 플레이어 목록을 만들어 컨텍스트에 넣음
// 인게임 화면·재판 연출 미리보기·InGamePlayArea가 사용
import { useRef } from "react"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { useInGamePlayerSession } from "../hooks/useInGamePlayerSession.js"
import { useInGameStore } from "../store/ingameStore.js"
import { InGamePlayerSessionContext } from "./InGamePlayerSessionContext.js"
import { buildPlayerSessionSourceFromGameState } from "../utils/buildPlayerSessionSourceFromGameState.js"

// 판 상태로 플레이어 목록 만들어 넣음 (찾기·테마 함수 포함)
export function InGamePlayerSessionProvider({
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
  children,
}) {
  const gameState = useInGameStore((s) => s.state)
  const built = buildPlayerSessionSourceFromGameState(gameState)
  // 판 상태가 비거나 모양이 틀린 순간엔 마지막 정상 목록 씀 (미리보기 자리로 안 바뀌게)
  const lastValidRef = useRef(null)
  if (built.sourcePlayers?.length) lastValidRef.current = built
  const { sourcePlayers, localPlayerId } = built.sourcePlayers?.length ? built : (lastValidRef.current ?? built)
  const session = useInGamePlayerSession({ playerCount, sourcePlayers, localPlayerId })

  return (
    <InGamePlayerSessionContext.Provider value={session}>
      {children}
    </InGamePlayerSessionContext.Provider>
  )
}
