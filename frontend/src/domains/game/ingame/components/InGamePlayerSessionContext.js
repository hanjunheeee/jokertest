import { createContext, useContext } from "react"

export const InGamePlayerSessionContext = createContext(null)

export function useInGamePlayerSessionContext() {
  const session = useContext(InGamePlayerSessionContext)

  if (!session) {
    throw new Error(
      "useInGamePlayerSessionContext must be used within InGamePlayerSessionProvider",
    )
  }

  return session
}
