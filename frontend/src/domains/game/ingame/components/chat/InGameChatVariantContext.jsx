// 채팅 모양 컨텍스트: board·closeup·tribunal 중 어느 모양인지
// 채팅 내용 틀이 값 넣음, 입력칸·보내기 버튼·메시지 줄이 꺼내 씀
import { createContext, useContext } from "react"

// 기본은 보드 모양, 꺼내기는 useChatVariant
export const InGameChatVariantContext = createContext(("board"))

export function useChatVariant() {
  return useContext(InGameChatVariantContext)
}
