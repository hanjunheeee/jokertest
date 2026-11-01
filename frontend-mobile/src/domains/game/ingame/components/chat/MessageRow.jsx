// 채팅 메시지 한 줄: 시각·보낸 사람·글 (내 글은 '나' 표시와 옅은 바탕, 알림 글은 가운데)
// MessageList가 씀, 닉네임 색은 플레이어 테마 색 (설정에서 끄면 기본 글자색)
import { THEME_TEXT_RENDER_CLASS, THEME_TEXT_SHADOW } from "@/shared/constants/ingamePlayerTheme.js"
import { TEXT_CLASS } from "./chatStyle.js"

// 받은 시각 → 시:분 (이상한 값이면 안 보임)
function formatTime(sentAt) {
    if (!Number.isFinite(sentAt)) return null
    const date = new Date(sentAt)
    if (Number.isNaN(date.getTime())) return null
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

// 알림 글 (보낸 사람 없는 메시지, 지금 데스크톱 데이터엔 없고 들어오면 이렇게 그림)
function SystemRow({ text }) {
    return (
        <li className="my-1 flex items-center gap-2 px-1">
            <span aria-hidden="true" className="h-px flex-1 bg-[#3a1a0c]/25" />
            <span className={`${TEXT_CLASS} text-center text-[0.82em] italic text-[#6a4526]`}>{text}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-[#3a1a0c]/25" />
        </li>
    )
}

// themeStyles 있고 닉네임 색 켜졌을 때만 색·그림자 (데스크톱 resolveInGameChatPlayerColor와 같음)
export default function MessageRow({ message, mine, themeStyles, nicknameColor, showTime }) {
    if (message.system || !message.playerId) return <SystemRow text={message.text} />

    const colored = Boolean(themeStyles) && nicknameColor
    const colorStyle = colored ? { color: themeStyles.color, textShadow: THEME_TEXT_SHADOW } : undefined
    const colorClass = colored ? THEME_TEXT_RENDER_CLASS : ""
    const time = showTime ? formatTime(message.sentAt) : null

    return (
        <li
            className={`${TEXT_CLASS} rounded-[0.4rem] px-1.5 py-[0.18rem] [overflow-wrap:anywhere] ${mine ? "bg-[#3a1a0c]/[0.09] [box-shadow:inset_3px_0_0_rgba(58,26,12,0.45)]" : ""}`}
            data-mine={mine || undefined}
        >
            {time ? <span className="mr-1.5 text-[0.82em] opacity-60">{time}</span> : null}
            {mine ? (
                <span className="mr-1 inline-block rounded-full bg-[#3a1a0c] px-1.5 align-[0.08em] text-[0.68em] leading-[1.45] text-[#f3e6c8]">
                    나
                </span>
            ) : null}
            <span className={colorClass} style={colorStyle}>{message.senderName}:</span>{" "}
            <span className={`whitespace-pre-wrap ${colorClass}`} style={colorStyle}>
                &quot;{message.text}&quot;
            </span>
        </li>
    )
}
