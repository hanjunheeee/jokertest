// 채팅 보내기 버튼: 리소스 그림만 (접근성용 aria-label)
// Composer가 씀, 누를 때 입력칸 초점을 안 뺏어서 키보드가 안 내려감
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_CHAT_ASSETS } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"
import { MOBILE_TALK_CHAT_ASSETS } from "@m/domains/game/ingame/constants/chat/mobileTalkChatAssets.js"
import {
    TALK_CHAT_SEND_BTN_CLASS,
    TALK_CHAT_SEND_IMG_CLASS,
} from "@m/domains/game/ingame/constants/chat/mobileTalkChatLayout.js"

const CLASSIC_BTN_CLASS =
    "relative flex h-11 w-[4.6rem] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform duration-200 ease-out active:scale-[0.99]"

const CLASSIC_IMG_CLASS = "block h-auto w-full select-none"

// 꺼졌을 때 흐리게 (역할 확인 동안)
const DISABLED_CLASS = "disabled:cursor-not-allowed disabled:opacity-45"

// variant talk: 카톡형 보내기 그림 (83×37), disabled면 꺼지고 흐리게 표시
export default function SendButton({ onSend, variant = "classic", disabled = false }) {
    const isTalk = variant === "talk"
    const src = isTalk ? MOBILE_TALK_CHAT_ASSETS.sendButton : INGAME_CHAT_ASSETS.sendButton

    return (
        <button
            type="button"
            aria-label="채팅 보내기"
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onSend}
            className={`${isTalk ? TALK_CHAT_SEND_BTN_CLASS : CLASSIC_BTN_CLASS} ${DISABLED_CLASS}`}
            style={{ outline: "none" }}
        >
            <PublicAsset src={src} alt="" className={isTalk ? TALK_CHAT_SEND_IMG_CLASS : CLASSIC_IMG_CLASS} />
        </button>
    )
}
