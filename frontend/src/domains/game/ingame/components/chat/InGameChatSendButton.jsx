// 채팅 보내기 버튼: 그림 위에 '보내기' 글자
// 채팅 내용 틀(InGameChatContent)이 사용, 모양은 variant 따라
import { INGAME_CHAT_ASSETS } from "../../constants/chat/ingameChatAssets.js"
import {
  getSendBtnClass,
  getSendBtnLabelClass,
} from "../../constants/chat/ingameChatLayout.js"
import { useChatVariant } from "./InGameChatVariantContext.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

// 누르면 onSend, 크기·자리는 variant별 모양값
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
