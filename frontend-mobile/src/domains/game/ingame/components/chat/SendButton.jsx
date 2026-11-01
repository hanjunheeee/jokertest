// 채팅 보내기 버튼: 데스크톱 보내기 그림 위에 '보내기' 글자 (막힘·전송 중 글자 없음, 데스크톱과 같음)
// Composer가 씀, 누를 때 입력칸 초점을 안 뺏어서 키보드가 안 내려감
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_CHAT_ASSETS } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"

// 그림은 원래 비율, 누르는 자리만 44px로 키움
export default function SendButton({ onSend }) {
    return (
        <button
            type="button"
            aria-label="채팅 보내기"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onSend}
            className="relative flex h-11 w-[4.6rem] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform duration-200 ease-out active:scale-[0.99]"
            style={{ outline: "none" }}
        >
            <PublicAsset src={INGAME_CHAT_ASSETS.sendButton} alt="" className="block h-auto w-full select-none" />
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[0.74rem] font-bold text-[#e9b582] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
            >
                보내기
            </span>
        </button>
    )
}
