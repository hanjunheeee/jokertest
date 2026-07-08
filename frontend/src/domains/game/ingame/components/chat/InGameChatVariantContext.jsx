/**
 * 채팅이 "탁자 위(보드)"인지 "확대 창(클로즈업)"인지 알려주는 값.
 *
 * 같은 Input·보내기·메시지 UI를 두 화면에서 재사용하기 위해,
 * InGameChatContent가 모드를 내려주고 하위 컴포넌트가 읽어 스타일을 바꿉니다.
 */
import { createContext, useContext } from "react"

/** @typedef {"board" | "closeup"} InGameChatVariant */

export const InGameChatVariantContext = createContext(/** @type {InGameChatVariant} */ ("board"))

/** @returns {InGameChatVariant} */
export function useInGameChatVariant() {
  return useContext(InGameChatVariantContext)
}
