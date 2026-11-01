import { createContext, useContext } from "react"

export const InGameChatVariantContext = createContext(("board"))

export function useChatVariant() {
  return useContext(InGameChatVariantContext)
}
