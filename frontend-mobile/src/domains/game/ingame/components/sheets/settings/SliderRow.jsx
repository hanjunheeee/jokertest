// 설정 시트 밀대 한 줄: 이름·밀대·오른쪽 숫자
// 채팅 탭(글자 크기)·사운드 탭(음량)이 씀 (데스크톱 SettingSliderRow와 같은 구성)
import RangeSlider from "../parts/RangeSlider.jsx"
import { ROW_LABEL_CLASS, ROW_PLATE_CLASS, ROW_VALUE_CLASS } from "./rowStyle.js"

// 오른쪽 숫자는 눈으로만 (화면 읽기는 slider 값으로)
export default function SliderRow({ label, min, max, value, onChange }) {
  return (
    <div className={ROW_PLATE_CLASS} data-setting-row>
      <span className={`${ROW_LABEL_CLASS} w-[6.9rem] shrink-0 whitespace-nowrap`}>{label}</span>
      <div className="min-w-0 flex-1">
        <RangeSlider ariaLabel={label} min={min} max={max} value={value} onChange={onChange} />
      </div>
      <span className={ROW_VALUE_CLASS} aria-hidden="true">{value}</span>
    </div>
  )
}
