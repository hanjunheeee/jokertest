import { INGAME_CHAT_ASSETS } from "../../constants/ingameChatAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const SEND_BUTTON_CLASS =
  "interactive-scale relative block w-[clamp(2.9rem,20cqi,4rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

const SEND_BUTTON_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.48rem,2.65cqi,0.64rem)] font-bold text-black [text-shadow:0_1px_2px_rgba(255,255,255,0.35)]"

/** 인게임 채팅 보내기 버튼 — 입력줄 우측 */
export default function InGameChatSendButton({ onSend, className = "" }) {
  return (
    <button
      type="button"
      className={`${SEND_BUTTON_CLASS} ${className}`}
      aria-label="채팅 보내기"
      onClick={onSend}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={INGAME_CHAT_ASSETS.sendButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={SEND_BUTTON_LABEL_CLASS} aria-hidden="true">
        보내기
      </span>
    </button>
  )
}
