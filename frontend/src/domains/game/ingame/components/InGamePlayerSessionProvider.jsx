// 파일 역할: InGamePlayerSessionProvider.jsx - 화면을 구성하는 컴포넌트입니다.
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { useInGamePlayerSession } from "../hooks/useInGamePlayerSession.js"
import { useInGameStore } from "../store/ingameStore.js"
import { InGamePlayerSessionContext } from "./InGamePlayerSessionContext.js"

/**
 * 인게임 플레이어·테마 색상 세션.
 * 보드·채팅·투표가 같은 playerId / theme를 공유합니다.
 */
export function InGamePlayerSessionProvider({
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
  children,
}) {
  const gameState = useInGameStore((s) => s.state)
  const session = useInGamePlayerSession({
    playerCount,
    sourcePlayers: gameState?.players ?? null,
    localPlayerId: gameState?.localPlayerId,
  })

  return (
    <InGamePlayerSessionContext.Provider value={session}>
      {children}
    </InGamePlayerSessionContext.Provider>
  )
}
