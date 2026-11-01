// 채팅 보내기 버튼: 데스크톱 보내기 그림 위에 '보내기'/'전송 중' 글자
// Composer가 씀, 누를 때 입력칸 초점을 안 뺏어서 키보드가 안 내려감
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_CHAT_ASSETS } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"

// sending이면 글자만 바꾸고 막지는 않음 (두 번 보내기는 세션 훅이 막음)
export default function SendButton({ onSend, disabled, sending }) {
    return (
        <button
            type="button"
            aria-label="채팅 보내기"
            aria-busy={sending || undefined}
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onSend}
            className="relative flex h-11 w-[4.6rem] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale"
            style={{ outline: "none" }}
        >
            <PublicAsset
                src={INGAME_CHAT_ASSETS.sendButton}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
            />
            <span
                aria-hidden="true"
                className="relative font-subheading text-[0.86rem] font-bold text-[#e9b582] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
            >
                {sending ? "전송 중" : "보내기"}
            </span>
        </button>
    )
}
