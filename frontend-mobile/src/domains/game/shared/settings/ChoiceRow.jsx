// 설정 고르기 줄: 제목·설명 + 좌우 화살표로 고르는 칸 (값 대신 고른 항목 순서로 넘김)
// RoleComposition(자동/직접 지정)이 씀
import { SETTING_LOOKS } from "./settingLooks.js"
import SettingRow from "./SettingRow.jsx"
import Stepper from "./Stepper.jsx"

// options = [{ value, label }]
export default function ChoiceRow({ look, label, description, options, value, onChange }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  const stepper = SETTING_LOOKS[look].stepper

  return (
    <SettingRow look={look} label={label} description={description}>
      <Stepper
        look={stepper}
        options={options.map((option) => option.label)}
        index={index}
        onIndexChange={(next) => onChange(options[next].value)}
        ariaLabel={label}
        widthClass={stepper.width.choice}
      />
    </SettingRow>
  )
}
