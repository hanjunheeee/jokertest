import { createContext, useContext } from "react"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { useInGamePlayerSession } from "../hooks/useInGamePlayerSession.js"

const InGamePlayerSessionContext = createContext(null)

/**
 * 인게임 플레이어·테마 색상 세션.
 * 보드·채팅·투표가 같은 playerId / theme를 공유합니다.
 */
export function InGamePlayerSessionProvider({
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
  children,
}) {
  const session = useInGamePlayerSession(playerCount)

  return (
    <InGamePlayerSessionContext.Provider value={session}>
      {children}
    </InGamePlayerSessionContext.Provider>
  )
}

/** @returns {ReturnType<typeof useInGamePlayerSession>} */
export function useInGamePlayerSessionContext() {
  const session = useContext(InGamePlayerSessionContext)

  if (!session) {
    throw new Error(
      "useInGamePlayerSessionContext must be used within InGamePlayerSessionProvider",
    )
  }

  return session
}
