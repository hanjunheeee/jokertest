// 채팅 세션 컨텍스트: 채팅 틀·재판 연출이 같이 쓰는 입력·메시지·보내기 값
// InGameChatSessionProvider가 값 넣음, 채팅 틀·재판 연출 문지기가 꺼내 씀
import { createContext, useContext } from "react"

// Provider 밖이면 null
export const InGameChatSessionContext = createContext(null)

// 컨텍스트 꺼내기, Provider 없이 쓰면 빈 값 대신 바로 오류
export function useInGameChatSessionContext() {
  const session = useContext(InGameChatSessionContext)

  if (!session) {
    throw new Error(
      "useInGameChatSessionContext must be used within InGameChatSessionProvider",
    )
  }

  return session
}
