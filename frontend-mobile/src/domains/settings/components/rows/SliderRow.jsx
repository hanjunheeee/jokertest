// 이름·값 한 줄 + 폭 100% 슬라이더 한 줄 (텍스트 크기·음량)
// tabs/GeneralTab.jsx·tabs/SoundTab.jsx가 씀
import RangeSlider from "@m/shared/ui/slider/RangeSlider.jsx"
import { LABEL_CLASS, STACK_ROW_CLASS, VALUE_CLASS } from "../../constants/settingStyles.js"

// 폰 폭에선 이름 옆에 막대를 두면 너무 짧아서 아래로 내림
export default function SliderRow({ label, min, max, value, onChange }) {
    return (
        <div className={STACK_ROW_CLASS}>
            <div className="flex items-baseline justify-between gap-4">
                <span className={LABEL_CLASS}>{label}</span>
                <span className={VALUE_CLASS} aria-hidden="true">{value}</span>
            </div>
            <RangeSlider ariaLabel={label} min={min} max={max} value={value} onChange={onChange} />
        </div>
    )
}
