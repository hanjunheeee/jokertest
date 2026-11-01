/**
 * 채팅 프레임 **안쪽** phase 타이머 — InGameChatContent와 동일 transform·perspective.
 */
import {
  INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  mapFrameInsetToLayoutBox,
} from "./ingameChatFrameLayout.js"

/**
 * 내장 타이머 ON일 때 메시지 목록 — top을 내리고 height를 같은 만큼 줄인다(프레임 %).
 */
export const CHAT_EMBEDDED_TIMER_MESSAGE_LIST_TOP_OFFSET_FRAME = 12

/** 인게임-채팅창프레임2.png — 상단 내장 타이머바 (메시지 목록과 겹침 허용) */
const CHAT_EMBEDDED_TIMER_INSET_FRAME = {
  top: 7,
  left: 2 + INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  right: 10,
  height: 12.5,
}

export const INGAME_CHAT_EMBEDDED_TIMER_INSET = mapFrameInsetToLayoutBox(
  CHAT_EMBEDDED_TIMER_INSET_FRAME,
)

/** 채팅 프레임 root(cqi) 안 — 메시지 목록 위 레이어 */
export const INGAME_CHAT_EMBEDDED_TIMER_WRAP_CLASS =
  "pointer-events-none absolute z-[4] min-h-0 [container-type:inline-size]"
