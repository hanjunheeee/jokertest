import { useRef } from "react"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { useInGamePlayerSession } from "../hooks/useInGamePlayerSession.js"
import { useInGameStore } from "../store/ingameStore.js"
import { InGamePlayerSessionContext } from "./InGamePlayerSessionContext.js"
import { buildPlayerSessionSourceFromGameState } from "../utils/buildPlayerSessionSourceFromGameState.js"

export function InGamePlayerSessionProvider({
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
  children,
}) {
  const gameState = useInGameStore((s) => s.state)
  const built = buildPlayerSessionSourceFromGameState(gameState)
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
