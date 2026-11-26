// 채팅 메시지 한 줄: 시각·보낸 사람·"글" (데스크톱 InGameChatMessageRow와 같은 줄 모양)
// MessageList가 씀, 이름만 플레이어 테마 색 띠 (설정에서 끄면 기본색), 말 본문은 기본 글자색
import { MSG_ROW_CLASS, TEXT_WRAP_CLASS, TEXT_WRAP_TRIM_CLASS } from "@/domains/game/ingame/constants/chat/ingameChatLayout.js"
import { CHAT_NAME_BAND_CLASS, resolveChatNameBand } from "@/domains/game/ingame/utils/chatNameBand.js"
import { TEXT_CLASS } from "./chatStyle.js"

// 받은 시각 → 시:분 (이상한 값이면 안 보임)
function formatTime(sentAt) {
    if (!Number.isFinite(sentAt)) return null
    const date = new Date(sentAt)
    if (Number.isNaN(date.getTime())) return null
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

// 이름 띠는 공용 resolveChatNameBand, 죽은 사람 줄은 회색 이름 띠, 말 본문은 기본 글자색
export default function MessageRow({ message, themeStyles, nicknameColor, showTime }) {
    const nameBand = resolveChatNameBand(themeStyles, nicknameColor, { dead: message.channel === "DEAD" })
    const time = showTime ? formatTime(message.sentAt) : null

    return (
        <li className={`${MSG_ROW_CLASS} max-w-full`} data-chat-channel={message.channel ?? undefined}>
            {time ? <span className={`shrink-0 ${TEXT_CLASS}`}>{time}</span> : null}
            <span className={`shrink-0 ${TEXT_CLASS}`}>
                {nameBand ? (
                    <span className={CHAT_NAME_BAND_CLASS} style={nameBand.style} data-chat-name-band={nameBand.kind}>
                        {message.senderName}
                    </span>
                ) : message.senderName}:
            </span>
            <span
                className={`min-w-0 box-border ${TEXT_CLASS} ${TEXT_WRAP_CLASS} ${TEXT_WRAP_TRIM_CLASS}`}
                aria-readonly="true"
            >
                &quot;{message.text}&quot;
            </span>
        </li>
    )
}
