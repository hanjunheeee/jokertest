import {
  SETUP_DESC_CLASS,
  SETUP_ROW_CLASS,
  SETUP_TITLE_CLASS,
} from "../constants/setupRowStyles.js"
import RangeSlider from "@/shared/ui/RangeSlider"

export default function SetupRangeRow({
  label,
  description,
  value,
  min,
  max,
  onChange,
}) {
  return (
    <div className={SETUP_ROW_CLASS} data-setup-row>
      <div className="min-w-0 flex-1">
        <p className={SETUP_TITLE_CLASS}>{label}</p>
        {description ? <p className={SETUP_DESC_CLASS}>{description}</p> : null}
      </div>

      <RangeSlider
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        ariaLabel={label}
      />
    </div>
  )
}
