// 설정 숫자 고르기 줄: 제목·설명 + 좌우 화살표 숫자 칸 (단위 붙여 보임)
// SettingsItemList·RoleCompositionBlock이 씀, 값 목록 만드는 규칙은 데스크톱 SetupStepperRow와 같음
import { useMemo } from "react"
import Stepper from "./Stepper.jsx"
import SettingRow from "./SettingRow.jsx"

// 최소~최대를 간격대로 늘어놓기
function buildOptions(min, max, step = 1) {
  const options = []
  for (let current = min; current <= max; current += step) options.push(current)
  return options
}

// 숫자 고르기 줄 (목록에 없는 값이면 첫 값 위치)
export default function StepperRow({ label, description, value, min, max, step = 1, unit, onChange }) {
  const options = useMemo(() => buildOptions(min, max, step), [min, max, step])
  const labels = useMemo(() => options.map((option) => (unit ? `${option}${unit}` : option)), [options, unit])
  const index = Math.max(0, options.indexOf(value))

  return (
    <SettingRow label={label} description={description}>
      <Stepper
        options={labels}
        index={index}
        onIndexChange={(next) => onChange(options[next])}
        ariaLabel={label}
        valueWidthClass={unit ? "w-[5.75rem]" : "w-[5rem]"}
      />
    </SettingRow>
  )
}
