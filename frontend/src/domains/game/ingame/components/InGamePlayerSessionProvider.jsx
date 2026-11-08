// 플레이어 세션 Provider: 판 상태로 플레이어 목록을 만들어 컨텍스트에 넣음
// 인게임 화면·재판 연출 미리보기가 사용
import { useMemo, useState } from "react"
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
  const built = useMemo(() => buildPlayerSessionSourceFromGameState(gameState), [gameState])
  // 판 상태가 비거나 모양이 틀린 순간엔 마지막 정상 목록 씀 (미리보기 자리로 안 바뀌게, 그리는 중에 맞춤)
  const [lastValid, setLastValid] = useState(null)
  const hasPlayers = Boolean(built.sourcePlayers?.length)
  if (hasPlayers && lastValid !== built) setLastValid(built)
  const { sourcePlayers, localPlayerId } = hasPlayers ? built : (lastValid ?? built)
  const session = useInGamePlayerSession({ playerCount, sourcePlayers, localPlayerId })

  return (
    <InGamePlayerSessionContext.Provider value={session}>
      {children}
    </InGamePlayerSessionContext.Provider>
  )
}
