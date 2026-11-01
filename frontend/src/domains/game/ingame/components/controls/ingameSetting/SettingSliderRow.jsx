import {
  ROW_VALUE_CLASS,
  SLIDER_CONTROL_CLASS,
  SLIDER_KNOB_CLASS,
  SLIDER_ROW_LABEL_CLASS,
  SLIDER_ROW_PLATE_CLASS,
  SLIDER_TRACK_CLASS,
  SLIDER_TRACK_LANE_CLASS,
  SLIDER_VALUE_CLASS,
  SLIDER_WRAP_CLASS,
  SLIDER_WRAP_INNER_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import RangeSlider from "@/shared/ui/RangeSlider.jsx"

export default function SettingSliderRow({ label, min, max, value, onChange }) {
  return (
    <div className={SLIDER_ROW_PLATE_CLASS} data-setting-row>
      <span className={`${SLIDER_ROW_LABEL_CLASS} w-[clamp(4.8rem,34%,5.6rem)]`}>
        {label}
      </span>

      <div className={SLIDER_WRAP_CLASS}>
        <RangeSlider
          ariaLabel={label}
          min={min}
          max={max}
          value={value}
          onChange={onChange}
          controlClassName={SLIDER_CONTROL_CLASS}
          valueClassName={SLIDER_VALUE_CLASS}
          wrapClassName={SLIDER_WRAP_INNER_CLASS}
          trackLaneClassName={SLIDER_TRACK_LANE_CLASS}
          trackClassName={SLIDER_TRACK_CLASS}
          knobClassName={SLIDER_KNOB_CLASS}
        />
      </div>

      <span className={ROW_VALUE_CLASS} aria-hidden="true">
        {value}
      </span>
    </div>
  )
}
