import { INGAME_CHAT_ASSETS } from "../../constants/ingameChatAssets.js"
import {
  INGAME_CHAT_CLOSE_BTN_CLASS,
  INGAME_CHAT_CLOSE_BTN_IMG_CLASS,
} from "../../constants/ingameChatLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 인게임 채팅 패널 — 우상단 닫기 버튼 */
export default function InGameChatCloseButton({ onClose }) {
  return (
    <button
      type="button"
      aria-label="채팅 닫기"
      onClick={onClose}
      className={INGAME_CHAT_CLOSE_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={INGAME_CHAT_ASSETS.closeButton}
        alt=""
        className={INGAME_CHAT_CLOSE_BTN_IMG_CLASS}
      />
    </button>
  )
}
