// 설정 창 채팅 탭: 채팅 글자 크기 밀대와 표시 체크 항목
// 설정 창 내용(SettingPanelContent)이 사용, 값은 settingsStore에 저장
import {
  INGAME_SETTING_CHAT_CHECKBOXES,
  INGAME_SETTING_CHAT_SLIDER,
  INGAME_SETTING_TIMER_PLACEMENT_CHAT_LABEL,
  INGAME_SETTING_SHOW_TIMER_PLACEMENT_OPTION,
} from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import { INGAME_TIMER_PLACEMENT } from "../../../constants/timebar/ingameTimerPlacement.js"
import { useSettingsStore } from "../../../../../settings/store/settingsStore.js"
import SettingCheckboxRow from "./SettingCheckboxRow.jsx"
import SettingSliderRow from "./SettingSliderRow.jsx"

// 체크 항목 기본값 (저장된 값이 없을 때 씀)
function defaultChatChecks() {
  return Object.fromEntries(
    INGAME_SETTING_CHAT_CHECKBOXES.map(({ id, defaultChecked }) => [id, defaultChecked]),
  )
}

// 바꾸면 settingsStore에 바로 씀, 채팅 줄·입력창이 그 값을 읽음
export default function SettingChatTab({
  timerPlacement = INGAME_TIMER_PLACEMENT.TIMEBAR,
  onTimerPlacementChange = null,
}) {
  const storedTextSize = useSettingsStore((s) => s.chatTextSize)
  const setChatTextSize = useSettingsStore((s) => s.setChatTextSize)
  const storedChecks = useSettingsStore((s) => s.chatChecks)
  const setChatCheck = useSettingsStore((s) => s.setChatCheck)

  // 저장 값이 없거나 일부만 있으면 기본값으로 채움
  const textSize = storedTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue
  const checks = { ...defaultChatChecks(), ...(storedChecks ?? {}) }
  const timerInChat = timerPlacement === INGAME_TIMER_PLACEMENT.CHAT

  return (
    <div className={TAB_BODY_CLASS}>
      <SettingSliderRow
        label={INGAME_SETTING_CHAT_SLIDER.label}
        min={INGAME_SETTING_CHAT_SLIDER.min}
        max={INGAME_SETTING_CHAT_SLIDER.max}
        value={textSize}
        onChange={setChatTextSize}
      />

      {INGAME_SETTING_CHAT_CHECKBOXES.map(({ id, label }) => (
        <SettingCheckboxRow
          key={id}
          label={label}
          checked={Boolean(checks[id])}
          onChange={(next) => setChatCheck(id, next)}
        />
      ))}

      {INGAME_SETTING_SHOW_TIMER_PLACEMENT_OPTION
      && typeof onTimerPlacementChange === "function" ? (
        <SettingCheckboxRow
          label={INGAME_SETTING_TIMER_PLACEMENT_CHAT_LABEL}
          checked={timerInChat}
          onChange={(next) => {
            onTimerPlacementChange(
              next ? INGAME_TIMER_PLACEMENT.CHAT : INGAME_TIMER_PLACEMENT.TIMEBAR,
            )
          }}
        />
      ) : null}
    </div>
  )
}