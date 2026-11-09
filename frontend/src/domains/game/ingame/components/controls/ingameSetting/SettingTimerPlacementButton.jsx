// 개발용: 설정 창 아래 타이머 자리 전환 (시간 바 ↔ 채팅 틀), Ctrl+Shift+T와 동일
// 설정 창 내용(SettingPanelContent)이 씀
import { INGAME_TIMER_PLACEMENT } from "../../../constants/timebar/ingameTimerPlacement.js"
import { SETTING_FOOTER_TIMER_PLACEMENT_BTN_WRAP_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import SettingFooterImageButton from "./SettingFooterImageButton.jsx"

export default function SettingTimerPlacementButton({
  timerPlacement,
  onCycle,
}) {
  if (import.meta.env?.DEV !== true) return null

  const isChat = timerPlacement === INGAME_TIMER_PLACEMENT.CHAT
  const label = isChat ? "타이머: 채팅" : "타이머: 시간바"

  return (
    <SettingFooterImageButton
      ariaLabel={`타이머 위치 전환, 현재 ${isChat ? "채팅 프레임 안" : "시간바 확대"}`}
      label={label}
      title="Ctrl+Shift+T — 타이머 위치 전환"
      onClick={onCycle}
      timerPlacementDevMarker
      wrapClassName={SETTING_FOOTER_TIMER_PLACEMENT_BTN_WRAP_CLASS}
    />
  )
}
