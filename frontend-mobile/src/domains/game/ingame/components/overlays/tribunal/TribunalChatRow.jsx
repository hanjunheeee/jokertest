// 재판 채팅 한 줄: 시각·보낸 사람·글을 가로로 (데스크톱 InGameChatMessageRow 재판 모양), 설정 따라 시각·닉네임 색·글자 크기
// 재판 채팅 칸(TribunalChat)이 씀, 설정 값은 데스크톱 설정 스토어
import { useContext } from "react"
import { InGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import {
    MSG_ROW_CLASS,
    TEXT_WRAP_CLASS,
    getInGameChatTextScaleStyle,
} from "@/domains/game/ingame/constants/chat/ingameChatLayout.js"
import {
    INGAME_SETTING_CHAT_CHECKBOXES,
    INGAME_SETTING_CHAT_SLIDER,
} from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js"
import { THEME_TEXT_RENDER_CLASS, THEME_TEXT_SHADOW } from "@/shared/constants/ingamePlayerTheme.js"
import { useSettingsStore } from "@/domains/settings/store/settingsStore.js"

// 설정 id별 기본값 (안 건드렸으면 이 값)
const defaultChecked = (id) => INGAME_SETTING_CHAT_CHECKBOXES.find((c) => c.id === id)?.defaultChecked ?? false
const SHOW_TIME_DEFAULT = defaultChecked("show-time")
const NICK_COLOR_DEFAULT = defaultChecked("nickname-color")

// 데스크톱 재판 채팅 글자 (글꼴·굵기·줄 간격·자간·색), 크기는 데스크톱 최대값에 설정 배율, 폰 하한 0.74rem
const TEXT_CLASS =
    "font-subheading text-[max(0.74rem,calc(0.92rem*var(--ingame-chat-text-scale,1)))] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

// 받은 시각을 시:분으로, 이상한 값이면 안 보임
function formatTime(sentAt) {
    if (!Number.isFinite(sentAt)) return null
    const date = new Date(sentAt)
    if (Number.isNaN(date.getTime())) return null
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

// 보낸 사람 색은 테마 색 (닉네임 색 설정 끄면 기본색)
export default function TribunalChatRow({ playerId = null, senderName, text, sentAt = null }) {
    const session = useContext(InGamePlayerSessionContext)
    const themeStyles = playerId ? session?.getThemeStylesByPlayerId?.(playerId) ?? null : null
    const nickColorOn = useSettingsStore((s) => s.chatChecks?.["nickname-color"] ?? NICK_COLOR_DEFAULT)
    const showTime = useSettingsStore((s) => s.chatChecks?.["show-time"] ?? SHOW_TIME_DEFAULT)
    const textSize = useSettingsStore((s) => s.chatTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue)

    const applyColor = Boolean(themeStyles) && nickColorOn
    const colorStyle = applyColor ? { color: themeStyles.color, textShadow: THEME_TEXT_SHADOW } : undefined
    const colorClass = applyColor ? THEME_TEXT_RENDER_CLASS : ""
    const time = showTime ? formatTime(sentAt) : null

    return (
        <li className={MSG_ROW_CLASS} style={getInGameChatTextScaleStyle(textSize)}>
            {time ? <span className={`shrink-0 opacity-60 ${TEXT_CLASS}`}>{time}</span> : null}
            <span className={`shrink-0 ${TEXT_CLASS} ${colorClass}`.trim()} style={colorStyle}>{senderName}:</span>
            <span className={`min-w-0 ${TEXT_CLASS} ${TEXT_WRAP_CLASS} ${colorClass}`.trim()} style={colorStyle}>
                &quot;{text}&quot;
            </span>
        </li>
    )
}
