import { INGAME_CHAT_ASSETS } from "../../constants/ingameChatAssets.js"
import {
  INGAME_CHAT_TOGGLE_BTN_CLASS,
  INGAME_CHAT_TOGGLE_BTN_IMG_CLASS,
  INGAME_CHAT_TOGGLE_POSITION_CLASS,
} from "../../constants/ingameChatLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 인게임 좌측 하단 — 채팅 패널 열기 버튼 */
export default function InGameChatToggleButton({
  onOpen,
  hasUnread = false,
  className = INGAME_CHAT_TOGGLE_POSITION_CLASS,
}) {
  const src = hasUnread
    ? INGAME_CHAT_ASSETS.openButtonUnread
    : INGAME_CHAT_ASSETS.openButton

  return (
    <div className={className}>
      <button
        type="button"
        aria-label={hasUnread ? "채팅 열기, 읽지 않은 메시지 있음" : "채팅 열기"}
        onClick={onOpen}
        className={INGAME_CHAT_TOGGLE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset src={src} alt="" className={INGAME_CHAT_TOGGLE_BTN_IMG_CLASS} />
      </button>
    </div>
  )
}
