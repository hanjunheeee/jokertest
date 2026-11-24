// 채팅 보내기 버튼 (글자는 리소스에 포함, aria-label만 제공)
// 채팅 내용 틀(InGameChatContent)이 사용, 모양은 variant 따라
import { INGAME_CHAT_ASSETS } from "../../constants/chat/ingameChatAssets.js"
import { getSendBtnClass } from "../../constants/chat/ingameChatLayout.js"
import { useChatVariant } from "./InGameChatVariantContext.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { INGAME_FOCUS_RING_CLASS } from "../../constants/ingameFocusRing.js"

// 누르면 onSend, 크기·자리는 variant별 모양값 (disabled면 꺼지고 흐리게)
export default function InGameChatSendButton({
  onSend,
  className = "",
  disabled = false,
}) {
  const variant = useChatVariant()

  return (
    <button
      type="button"
      className={`${getSendBtnClass(variant)} ${className} ${INGAME_FOCUS_RING_CLASS} disabled:cursor-not-allowed disabled:opacity-45`.trim()}
      aria-label="채팅 보내기"
      disabled={disabled}
      onClick={onSend}
    >
      <PublicAsset
        src={INGAME_CHAT_ASSETS.sendButton}
        alt=""
        className="block h-auto w-full select-none"
      />
    </button>
  )
}
