// 재판 채팅 한 줄: 시각·보낸 사람·글을 가로로 (데스크톱 InGameChatMessageRow 재판 모양), 설정 따라 시각·닉네임 색·글자 크기
// 재판 채팅 칸(TribunalChat)이 씀, 이름만 테마 색+배경 띠, 말 본문은 기본 글자색
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
import { CHAT_NAME_BAND_CLASS, resolveChatNameBand } from "@/domains/game/ingame/utils/chatNameBand.js"
import { useSettingsStore } from "@/domains/settings/store/settingsStore.js"

// 설정 id별 기본값 (안 건드렸으면 이 값)
const defaultChecked = (id) => INGAME_SETTING_CHAT_CHECKBOXES.find((c) => c.id === id)?.defaultChecked ?? false
const SHOW_TIME_DEFAULT = defaultChecked("show-time")
const NICK_COLOR_DEFAULT = defaultChecked("nickname-color")

// 재판 채팅 글자: 양피지 위 대비가 높게 가장 짙은 갈색(#140c08) 사용
const TEXT_CLASS =
    "font-subheading text-[max(0.74rem,calc(0.92rem*var(--ingame-chat-text-scale,1)))] font-bold leading-[1.35] tracking-[0.04em] text-[#140c08]"

// 받은 시각을 시:분으로, 이상한 값이면 안 보임
function formatTime(sentAt) {
    if (!Number.isFinite(sentAt)) return null
    const date = new Date(sentAt)
    if (Number.isNaN(date.getTime())) return null
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

// 이름만 테마 색 띠 (닉네임 색 설정 끄면 기본색), 죽은 사람 줄은 회색 이름 띠, 말 본문은 기본 글자색
export default function TribunalChatRow({ playerId = null, senderName, text, sentAt = null, channel = null }) {
    const session = useContext(InGamePlayerSessionContext)
    const themeStyles = playerId ? session?.getThemeStylesByPlayerId?.(playerId) ?? null : null
    const nickColorOn = useSettingsStore((s) => s.chatChecks?.["nickname-color"] ?? NICK_COLOR_DEFAULT)
    const showTime = useSettingsStore((s) => s.chatChecks?.["show-time"] ?? SHOW_TIME_DEFAULT)
    const textSize = useSettingsStore((s) => s.chatTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue)

    const nameBand = resolveChatNameBand(themeStyles, nickColorOn, { dead: channel === "DEAD" })
    const time = showTime ? formatTime(sentAt) : null

    return (
        <li className={MSG_ROW_CLASS} style={getInGameChatTextScaleStyle(textSize)} data-chat-channel={channel ?? undefined}>
            {time ? <span className={`shrink-0 ${TEXT_CLASS}`}>{time}</span> : null}
            <span className={`shrink-0 ${TEXT_CLASS}`}>
                {nameBand ? (
                    <span className={CHAT_NAME_BAND_CLASS} style={nameBand.style} data-chat-name-band={nameBand.kind}>
                        {senderName}
                    </span>
                ) : senderName}:
            </span>
            <span className={`min-w-0 ${TEXT_CLASS} ${TEXT_WRAP_CLASS}`}>
                &quot;{text}&quot;
            </span>
        </li>
    )
}
