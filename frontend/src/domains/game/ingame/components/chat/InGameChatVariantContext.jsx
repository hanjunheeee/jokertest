import { createContext, useContext } from "react"

export const InGameChatVariantContext = createContext(("board"))

export function useInGameChatVariant() {
  return useContext(InGameChatVariantContext)
}
