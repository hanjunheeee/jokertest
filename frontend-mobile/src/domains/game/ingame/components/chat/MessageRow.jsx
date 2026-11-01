// 채팅 메시지 한 줄: 시각·보낸 사람·"글" (데스크톱 InGameChatMessageRow와 같은 줄 모양)
// MessageList가 씀, 닉네임 색은 플레이어 테마 색 (설정에서 끄면 기본 글자색)
import { THEME_TEXT_RENDER_CLASS, THEME_TEXT_SHADOW } from "@/shared/constants/ingamePlayerTheme.js"
import { MSG_ROW_CLASS, TEXT_WRAP_CLASS, TEXT_WRAP_TRIM_CLASS } from "@/domains/game/ingame/constants/chat/ingameChatLayout.js"
import { TEXT_CLASS } from "./chatStyle.js"

// 받은 시각 → 시:분 (이상한 값이면 안 보임)
function formatTime(sentAt) {
    if (!Number.isFinite(sentAt)) return null
    const date = new Date(sentAt)
    if (Number.isNaN(date.getTime())) return null
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

// themeStyles 있고 닉네임 색 켜졌을 때만 색·그림자 (데스크톱 resolveInGameChatPlayerColor와 같음)
export default function MessageRow({ message, themeStyles, nicknameColor, showTime }) {
    const colored = Boolean(themeStyles) && nicknameColor
    const colorStyle = colored ? { color: themeStyles.color, textShadow: THEME_TEXT_SHADOW } : undefined
    const colorClass = colored ? THEME_TEXT_RENDER_CLASS : ""
    const time = showTime ? formatTime(message.sentAt) : null

    return (
        <li className={`${MSG_ROW_CLASS} max-w-full`}>
            {time ? <span className={`shrink-0 opacity-60 ${TEXT_CLASS}`}>{time}</span> : null}
            <span className={`shrink-0 ${TEXT_CLASS} ${colorClass}`.trim()} style={colorStyle}>
                {message.senderName}:
            </span>
            <span
                className={`min-w-0 box-border ${TEXT_CLASS} ${TEXT_WRAP_CLASS} ${TEXT_WRAP_TRIM_CLASS} ${colorClass}`.trim()}
                aria-readonly="true"
                style={colorStyle}
            >
                &quot;{message.text}&quot;
            </span>
        </li>
    )
}
