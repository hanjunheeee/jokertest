// 플레이어 세션 컨텍스트: 보드·채팅·기록 목록이 같이 보는 플레이어 목록 값
// InGamePlayerSessionProvider가 값 넣음, 보드·채팅·재판 연출·기록 목록·여러 훅이 꺼내 씀
import { createContext, useContext } from "react"

// Provider 밖이면 null
export const InGamePlayerSessionContext = createContext(null)

// 컨텍스트 꺼내기, Provider 없이 쓰면 빈 값 대신 바로 오류
export function useInGamePlayerSessionContext() {
  const session = useContext(InGamePlayerSessionContext)

  if (!session) {
    throw new Error(
      "useInGamePlayerSessionContext must be used within InGamePlayerSessionProvider",
    )
  }

  return session
}
