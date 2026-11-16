// 채팅 닉네임 색 설정 켜짐 여부 (이름 띠 모양은 utils/chatNameBand.js)
// 채팅 메시지 줄(InGameChatMessageRow)이 사용
import { INGAME_SETTING_CHAT_CHECKBOXES } from "../../constants/controls/ingameSetting/ingameSettingData.js"

// 닉네임 색 설정 id와 기본값 (설정 화면 목록 값 그대로)
const NICKNAME_COLOR_SETTING_ID = "nickname-color"

const NICKNAME_COLOR_DEFAULT_CHECKED =
  INGAME_SETTING_CHAT_CHECKBOXES.find(({ id }) => id === NICKNAME_COLOR_SETTING_ID)
    ?.defaultChecked ?? false

// 닉네임 색 켜짐 여부 (안 건드렸으면 기본값)
export function selectNicknameColorEnabled(state) {
  return state.chatChecks?.[NICKNAME_COLOR_SETTING_ID] ?? NICKNAME_COLOR_DEFAULT_CHECKED
}
