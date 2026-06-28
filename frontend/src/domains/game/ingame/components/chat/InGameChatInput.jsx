import { INGAME_CHAT_ASSETS, INGAME_CHAT_MAX_MESSAGE_LENGTH } from "../../constants/ingameChatAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/**
 * 인게임 채팅 텍스트 입력 + 작성 표시
 * 보내기 버튼은 InGameChatSendButton — 패널에서 별도 inset으로 배치
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
    <div
      className={`relative flex min-h-[clamp(1.5rem,9cqi,2rem)] items-center ${className}`}
    >
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
        className="pointer-events-none absolute right-[clamp(0.35rem,2.2cqi,0.55rem)] top-[55%] h-[clamp(0.85rem,5.2cqi,1.15rem)] w-auto -translate-y-1/2 select-none"
      />
    </div>
  )
}
