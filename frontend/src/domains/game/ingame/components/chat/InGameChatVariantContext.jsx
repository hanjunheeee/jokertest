import { createContext, useContext } from "react"

export const InGameChatVariantContext = createContext(/** @type {InGameChatVariant} */ ("board"))

export function useInGameChatVariant() {
  return useContext(InGameChatVariantContext)
}
