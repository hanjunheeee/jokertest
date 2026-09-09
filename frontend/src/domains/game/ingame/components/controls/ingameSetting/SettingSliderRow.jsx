/**
 * 인게임 설정 — 슬라이더 행 (라벨 · 슬라이더 · 숫자)
 */
import {
  INGAME_SETTING_ROW_VALUE_CLASS,
  INGAME_SETTING_SLIDER_CONTROL_CLASS,
  INGAME_SETTING_SLIDER_KNOB_CLASS,
  INGAME_SETTING_SLIDER_ROW_LABEL_CLASS,
  INGAME_SETTING_SLIDER_ROW_PLATE_CLASS,
  INGAME_SETTING_SLIDER_TRACK_CLASS,
  INGAME_SETTING_SLIDER_TRACK_LANE_CLASS,
  INGAME_SETTING_SLIDER_VALUE_CLASS,
  INGAME_SETTING_SLIDER_WRAP_CLASS,
  INGAME_SETTING_SLIDER_WRAP_INNER_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import RangeSlider from "@/shared/ui/RangeSlider.jsx"

export default function SettingSliderRow({ label, min, max, value, onChange }) {
  return (
    <div className={INGAME_SETTING_SLIDER_ROW_PLATE_CLASS} data-setting-row>
      <span className={`${INGAME_SETTING_SLIDER_ROW_LABEL_CLASS} w-[clamp(4.8rem,34%,5.6rem)]`}>
        {label}
      </span>

      <div className={INGAME_SETTING_SLIDER_WRAP_CLASS}>
        <RangeSlider
          ariaLabel={label}
          min={min}
          max={max}
          value={value}
          onChange={onChange}
          controlClassName={INGAME_SETTING_SLIDER_CONTROL_CLASS}
          valueClassName={INGAME_SETTING_SLIDER_VALUE_CLASS}
          wrapClassName={INGAME_SETTING_SLIDER_WRAP_INNER_CLASS}
          trackLaneClassName={INGAME_SETTING_SLIDER_TRACK_LANE_CLASS}
          trackClassName={INGAME_SETTING_SLIDER_TRACK_CLASS}
          knobClassName={INGAME_SETTING_SLIDER_KNOB_CLASS}
        />
      </div>

      <span className={INGAME_SETTING_ROW_VALUE_CLASS} aria-hidden="true">
        {value}
      </span>
    </div>
  )
}
