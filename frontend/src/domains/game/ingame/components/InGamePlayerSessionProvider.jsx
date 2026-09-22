// 파일 역할: InGamePlayerSessionProvider.jsx - 화면을 구성하는 컴포넌트입니다.
import { useRef } from "react"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { useInGamePlayerSession } from "../hooks/useInGamePlayerSession.js"
import { useInGameStore } from "../store/ingameStore.js"
import { InGamePlayerSessionContext } from "./InGamePlayerSessionContext.js"
import { buildPlayerSessionSourceFromGameState } from "../utils/buildPlayerSessionSourceFromGameState.js"

/**
 * 인게임 플레이어·테마 색상 세션.
 * 보드·채팅·투표가 같은 playerId / theme를 공유합니다.
 */
export function InGamePlayerSessionProvider({
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
  children,
}) {
  const gameState = useInGameStore((s) => s.state)
  const built = buildPlayerSessionSourceFromGameState(gameState)
  // 스냅샷 재적용·일시적으로 어긋난 명단 때문에 실제 명단이 잠깐 비면(builder는 fail-closed로 null을
  // 준다) 예전에는 10칸 더미 링으로 갈아끼웠다가 되돌아와 보드 전체가 튀었다(2026-09-22 실제 인수
  // "UI 튀는 문제"). 한 번이라도 유효했던 명단은 다음 유효 명단이 올 때까지 유지한다. 미리보기(게임
  // 없음)는 유효 명단이 한 번도 없었을 때만 쓰인다.
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
