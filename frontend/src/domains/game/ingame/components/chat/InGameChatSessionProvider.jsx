import { useInGameChatShellProps } from "../../hooks/useInGameChatShellProps.js"
import { InGameChatSessionContext } from "./InGameChatSessionContext.js"

/**
 * 인게임 채팅 세션 단일 인스턴스 — 보드·클로즈업·TRIBUNAL 연출 패널이 같은 draft·messages·send를 공유한다.
 */
export function InGameChatSessionProvider({ children }) {
  const chatSession = useInGameChatShellProps()

  return (
    <InGameChatSessionContext.Provider value={chatSession}>
      {children}
    </InGameChatSessionContext.Provider>
  )
}
