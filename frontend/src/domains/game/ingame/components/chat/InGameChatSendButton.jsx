import { INGAME_CHAT_ASSETS } from "../../constants/chat/ingameChatAssets.js"
import {
  getSendBtnClass,
  getSendBtnLabelClass,
} from "../../constants/chat/ingameChatLayout.js"
import { useChatVariant } from "./InGameChatVariantContext.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function InGameChatSendButton({
  onSend,
  className = "",
}) {
  const variant = useChatVariant()

  return (
    <button
      type="button"
      className={`${getSendBtnClass(variant)} ${className}`.trim()}
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
        className={getSendBtnLabelClass(variant)}
        aria-hidden="true"
      >
        보내기
      </span>
    </button>
  )
}
