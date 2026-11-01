// 재판 채팅 한 줄: 시각·보낸 사람·글, 설정 따라 시각·닉네임 색·글자 크기
// 재판 채팅 칸(TribunalChat)이 씀, 설정 값은 데스크톱 설정 스토어
import { useContext } from "react"
import { InGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { getInGameChatTextScaleStyle } from "@/domains/game/ingame/constants/chat/ingameChatLayout.js"
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

// 받은 시각을 시:분으로, 이상한 값이면 안 보임
function formatTime(sentAt) {
    if (!Number.isFinite(sentAt)) return null
    const date = new Date(sentAt)
    if (Number.isNaN(date.getTime())) return null
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

// 글자 크기는 채팅 글자 배율 변수로 곱함
const ROW_CLASS =
    "break-words text-[calc(0.92rem*var(--ingame-chat-text-scale,1))] font-bold leading-snug text-[#3a1a0c] [word-break:keep-all]"

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
        <li className={ROW_CLASS} style={getInGameChatTextScaleStyle(textSize)}>
            {time ? <span className="mr-1.5 text-[0.75em] font-normal text-[#5b3a20]">{time}</span> : null}
            <span className={colorClass} style={colorStyle}>{senderName}: </span>
            <span className={colorClass} style={colorStyle}>&quot;{text}&quot;</span>
        </li>
    )
}
