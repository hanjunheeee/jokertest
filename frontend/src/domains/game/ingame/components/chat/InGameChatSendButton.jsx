import { INGAME_CHAT_ASSETS } from "../../constants/chat/ingameChatAssets.js"
import {
  getInGameChatSendButtonClass,
  getInGameChatSendButtonLabelClass,
} from "../../constants/chat/ingameChatLayout.js"
import { useInGameChatVariant } from "./InGameChatVariantContext.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 인게임 채팅 보내기 버튼 — 입력창과 분리 배치 */
export default function InGameChatSendButton({
  onSend,
  className = "",
}) {
  const variant = useInGameChatVariant()

  return (
    <button
      type="button"
      className={`${getInGameChatSendButtonClass(variant)} ${className}`.trim()}
      aria-label="채팅 보내기"
      onClick={onSend}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={INGAME_CHAT_ASSETS.sendButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span
        className={getInGameChatSendButtonLabelClass(variant)}
        aria-hidden="true"
      >
        보내기
      </span>
    </button>
  )
}
