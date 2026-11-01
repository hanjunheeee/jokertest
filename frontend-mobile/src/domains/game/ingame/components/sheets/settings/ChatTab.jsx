// 설정 시트 채팅 탭: 채팅 글자 크기 밀대와 표시 체크 항목
// SettingsBody가 씀, 값은 데스크톱 settingsStore에 바로 저장 (SettingChatTab과 같은 규칙)
import {
  INGAME_SETTING_CHAT_CHECKBOXES,
  INGAME_SETTING_CHAT_SLIDER,
} from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js"
import { useSettingsStore } from "@/domains/settings/store/settingsStore.js"
import CheckRow from "./CheckRow.jsx"
import SliderRow from "./SliderRow.jsx"
import { TAB_BODY_CLASS } from "./rowStyle.js"

// 체크 항목 기본값 (저장된 값이 없을 때 씀)
function defaultChatChecks() {
  return Object.fromEntries(
    INGAME_SETTING_CHAT_CHECKBOXES.map(({ id, defaultChecked }) => [id, defaultChecked]),
  )
}

// 바꾸면 settingsStore에 바로 씀, 채팅 줄·입력창이 그 값을 읽음
export default function ChatTab() {
  const storedTextSize = useSettingsStore((s) => s.chatTextSize)
  const setChatTextSize = useSettingsStore((s) => s.setChatTextSize)
  const storedChecks = useSettingsStore((s) => s.chatChecks)
  const setChatCheck = useSettingsStore((s) => s.setChatCheck)

  // 저장 값이 없거나 일부만 있으면 기본값으로 채움
  const textSize = storedTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue
  const checks = { ...defaultChatChecks(), ...(storedChecks ?? {}) }

  return (
    <div className={TAB_BODY_CLASS}>
      <SliderRow
        label={INGAME_SETTING_CHAT_SLIDER.label}
        min={INGAME_SETTING_CHAT_SLIDER.min}
        max={INGAME_SETTING_CHAT_SLIDER.max}
        value={textSize}
        onChange={setChatTextSize}
      />
      {INGAME_SETTING_CHAT_CHECKBOXES.map(({ id, label }) => (
        <CheckRow
          key={id}
          label={label}
          checked={Boolean(checks[id])}
          onChange={(next) => setChatCheck(id, next)}
        />
      ))}
    </div>
  )
}
