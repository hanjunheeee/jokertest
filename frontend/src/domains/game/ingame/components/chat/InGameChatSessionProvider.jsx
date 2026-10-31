import { useInGameChatShellProps } from "../../hooks/useInGameChatShellProps.js"
import { InGameChatSessionContext } from "./InGameChatSessionContext.js"

export function InGameChatSessionProvider({ children }) {
  const chatSession = useInGameChatShellProps()

  return (
    <InGameChatSessionContext.Provider value={chatSession}>
      {children}
    </InGameChatSessionContext.Provider>
  )
}
