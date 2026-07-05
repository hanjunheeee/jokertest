import {
  INGAME_CHAT_PANEL_POSITION_CLASS,
  getInGameChatPanelStyle,
} from "../../constants/ingameChatLayout.js"
import InGameChatContent from "./InGameChatContent.jsx"

/**
 * 인게임 채팅 — 탁자 중앙 상시 표시 (접기/오버레이 없음)
 */
export default function InGameChatShell() {
  return (
    <aside
      aria-label="채팅"
      className={INGAME_CHAT_PANEL_POSITION_CLASS}
      style={getInGameChatPanelStyle()}
    >
      <InGameChatContent />
    </aside>
  )
}
