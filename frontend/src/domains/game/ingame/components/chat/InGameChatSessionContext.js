import { createContext, useContext } from "react"

export const InGameChatSessionContext = createContext(null)

export function useInGameChatSessionContext() {
  const session = useContext(InGameChatSessionContext)

  if (!session) {
    throw new Error(
      "useInGameChatSessionContext must be used within InGameChatSessionProvider",
    )
  }

  return session
}
