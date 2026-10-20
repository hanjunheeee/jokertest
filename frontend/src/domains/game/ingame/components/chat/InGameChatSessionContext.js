import { createContext, useContext } from "react"

export const InGameChatSessionContext = createContext(null)

/** InGameChatSessionProvider 안에서 공유하는 채팅 세션 props. */
export function useInGameChatSessionContext() {
  const session = useContext(InGameChatSessionContext)

  if (!session) {
    throw new Error(
      "useInGameChatSessionContext must be used within InGameChatSessionProvider",
    )
  }

  return session
}
