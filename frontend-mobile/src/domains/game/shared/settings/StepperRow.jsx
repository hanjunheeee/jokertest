// 설정 숫자 고르기 줄: 제목·설명 + 좌우 화살표 숫자 칸 (단위 붙여 보임)
// SettingList·RoleComposition이 씀, 값 목록 만드는 규칙은 데스크톱 SetupStepperRow와 같음
import { useMemo } from "react"
import { SETTING_LOOKS } from "./settingLooks.js"
import SettingRow from "./SettingRow.jsx"
import Stepper from "./Stepper.jsx"

// 최소~최대를 간격대로 늘어놓기
function buildOptions(min, max, step = 1) {
  const options = []
  for (let current = min; current <= max; current += step) options.push(current)
  return options
}

// 숫자 고르기 줄 (목록에 없는 값이면 첫 값으로 보임, 데스크톱과 같음)
export default function StepperRow({ look, label, description, value, min, max, step = 1, unit, onChange }) {
  const options = useMemo(() => buildOptions(min, max, step), [min, max, step])
  const labels = useMemo(() => options.map((o) => (unit ? `${o}${unit}` : o)), [options, unit])
  const index = Math.max(0, options.indexOf(value))
  const stepper = SETTING_LOOKS[look].stepper

  return (
    <SettingRow look={look} label={label} description={description}>
      <Stepper
        look={stepper}
        options={labels}
        index={index}
        onIndexChange={(next) => onChange(options[next])}
        ariaLabel={label}
        widthClass={unit ? stepper.width.unit : stepper.width.plain}
      />
    </SettingRow>
  )
}
