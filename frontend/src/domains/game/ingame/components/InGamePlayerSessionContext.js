import { createContext, useContext } from "react"

export const InGamePlayerSessionContext = createContext(null)

/** 인게임 플레이어 세션 컨텍스트를 반환합니다. */
export function useInGamePlayerSessionContext() {
  const session = useContext(InGamePlayerSessionContext)

  if (!session) {
    throw new Error(
      "useInGamePlayerSessionContext must be used within InGamePlayerSessionProvider",
    )
  }

  return session
}
