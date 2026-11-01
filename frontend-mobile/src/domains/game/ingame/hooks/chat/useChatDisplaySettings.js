// 채팅 보기 설정: 글자 배율·시각 보이기·닉네임 색 켜짐 (인게임 설정 채팅 탭 값)
// MessageList가 씀, 기본값은 데스크톱 설정 목록 값 그대로
import { useSettingsStore } from "@/domains/settings/store/settingsStore.js"
import {
    INGAME_SETTING_CHAT_CHECKBOXES,
    INGAME_SETTING_CHAT_SLIDER,
} from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js"
import { getInGameChatTextScale } from "@/domains/game/ingame/constants/chat/ingameChatLayout.js"

// 설정 id별 기본 켜짐 (안 건드렸을 때)
function defaultChecked(id) {
    return INGAME_SETTING_CHAT_CHECKBOXES.find((item) => item.id === id)?.defaultChecked ?? false
}

const SHOW_TIME_DEFAULT = defaultChecked("show-time")
const NICKNAME_COLOR_DEFAULT = defaultChecked("nickname-color")

const selectTextSize = (s) => s.chatTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue
const selectShowTime = (s) => s.chatChecks?.["show-time"] ?? SHOW_TIME_DEFAULT
const selectNicknameColor = (s) => s.chatChecks?.["nickname-color"] ?? NICKNAME_COLOR_DEFAULT

// 배율은 데스크톱과 같은 0.6~1
export function useChatDisplaySettings() {
    const textSize = useSettingsStore(selectTextSize)
    const showTime = useSettingsStore(selectShowTime)
    const nicknameColor = useSettingsStore(selectNicknameColor)

    return { textScale: getInGameChatTextScale(textSize), showTime, nicknameColor }
}
