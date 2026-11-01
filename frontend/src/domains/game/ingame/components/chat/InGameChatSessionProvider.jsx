// 채팅 세션 Provider: 채팅 세션 값을 한 곳에서 만들어 아래에 나눠 줌
// 인게임 화면이 사용, 값은 useInGameChatShellProps (낮 채팅·조커 밤 채팅 중 하나)
import { useInGameChatShellProps } from "../../hooks/useInGameChatShellProps.js"
import { InGameChatSessionContext } from "./InGameChatSessionContext.js"

// 채팅 틀과 재판 연출 채팅이 같은 세션을 보게 한 번만 만듦
export function InGameChatSessionProvider({ children }) {
  const chatSession = useInGameChatShellProps()

  return (
    <InGameChatSessionContext.Provider value={chatSession}>
      {children}
    </InGameChatSessionContext.Provider>
  )
}
