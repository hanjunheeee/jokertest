// 설정 고르기 줄: 제목·설명 + 좌우 화살표로 고르는 칸
// tabs/RolesTab이 씀 (역할 구성 자동/직접 지정)
import { DESC_CLASS, ROW_CLASS, ROW_TEXT_CLASS, TITLE_CLASS } from "../../constants/setupLayout.js"
import Stepper from "./Stepper.jsx"

// 고르기 줄 (값 대신 고른 항목 순서로 넘김)
export default function ChoiceRow({ label, description, options, value, onChange }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))

  return (
    <div className={ROW_CLASS} data-setup-row>
      <div className={ROW_TEXT_CLASS}>
        <p className={TITLE_CLASS}>{label}</p>
        {description ? <p className={DESC_CLASS}>{description}</p> : null}
      </div>
      <Stepper
        options={options.map((option) => option.label)}
        index={index}
        onIndexChange={(next) => onChange(options[next].value)}
        ariaLabel={label}
        wide
      />
    </div>
  )
}
