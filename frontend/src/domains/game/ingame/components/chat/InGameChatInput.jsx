import { INGAME_CHAT_ASSETS, INGAME_CHAT_MAX_MESSAGE_LENGTH } from "../../constants/ingameChatAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const SEND_BUTTON_CLASS =
  "interactive-scale relative block w-[clamp(3.25rem,20cqi,4.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

const SEND_BUTTON_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.55rem,3.2cqi,0.72rem)] font-bold text-black [text-shadow:0_1px_2px_rgba(255,255,255,0.35)]"

/**
 * 인게임 채팅 입력창 + 작성 표시 + 전송 버튼
 */
export default function InGameChatInput({
  value,
  onChange,
  onSend,
  className = "",
}) {
  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    onSend?.()
  }

  return (
    <div className={`flex flex-col gap-[0.35em] ${className}`}>
      <div className="relative flex min-h-[clamp(1.5rem,9cqi,2rem)] items-center">
        <input
          type="text"
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder="TYPE HERE..."
          maxLength={INGAME_CHAT_MAX_MESSAGE_LENGTH}
          className="w-full border-0 bg-transparent pr-[clamp(1.55rem,9.2cqi,2.1rem)] font-subheading text-[clamp(0.62rem,2.65cqi,0.82rem)] font-bold uppercase tracking-[0.04em] text-[#3a1a0c] outline-none placeholder:text-[#6b4a32]/75"
          aria-label="채팅 입력"
        />
        <PublicAsset
          src={INGAME_CHAT_ASSETS.writingIndicator}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-[54%] h-[clamp(1.05rem,6.4cqi,1.4rem)] w-auto -translate-y-1/2 select-none"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className={`${SEND_BUTTON_CLASS} translate-x-[clamp(0.12rem,0.85cqi,0.28rem)] translate-y-[clamp(0.08rem,0.55cqi,0.2rem)]`}
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
      </div>
    </div>
  )
}
