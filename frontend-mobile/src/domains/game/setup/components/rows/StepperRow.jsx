// 설정 숫자 고르기 줄: 제목·설명 + 좌우 화살표 숫자 칸
// SetupList·tabs/RolesTab이 씀
import { useMemo } from "react"
import { DESC_CLASS, ROW_CLASS, ROW_TEXT_CLASS, TITLE_CLASS } from "../../constants/setupLayout.js"
import Stepper from "./Stepper.jsx"

// 최소~최대를 간격대로 늘어놓기
function buildOptions(min, max, step = 1) {
  const options = []
  for (let current = min; current <= max; current += step) options.push(current)
  return options
}

// 숫자 고르기 줄 (목록에 없는 값이면 첫 값으로 보임, 데스크톱과 같음)
export default function StepperRow({ label, description, value, min, max, step = 1, unit, onChange }) {
  const options = useMemo(() => buildOptions(min, max, step), [min, max, step])
  const labels = useMemo(() => options.map((o) => (unit ? `${o}${unit}` : o)), [options, unit])
  const index = Math.max(0, options.indexOf(value))

  return (
    <div className={ROW_CLASS} data-setup-row>
      <div className={ROW_TEXT_CLASS}>
        <p className={TITLE_CLASS}>{label}</p>
        {description ? <p className={DESC_CLASS}>{description}</p> : null}
      </div>
      <Stepper
        options={labels}
        index={index}
        onIndexChange={(next) => onChange(options[next])}
        ariaLabel={label}
      />
    </div>
  )
}
