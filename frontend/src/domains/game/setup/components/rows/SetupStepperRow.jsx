// 설정 숫자 고르기 줄: 제목·설명 + 좌우 화살표 숫자 칸
// SetupTabContent·RoleCompositionSection이 씀
import { useMemo } from "react"
import { GAME_SETUP_ASSETS } from "../../constants/gameSetupAssets.js"
import {
  SETUP_DESC_CLASS,
  SETUP_ROW_CLASS,
  SETUP_TITLE_CLASS,
} from "../../constants/setupRowStyles.js"
import Stepper from "@/shared/ui/Stepper"

// 최소~최대를 간격대로 늘어놓기
function buildOptions(min, max, step = 1) {
  const options = []
  for (let current = min; current <= max; current += step) {
    options.push(current)
  }
  return options
}

// 숫자 고르기 줄
export default function SetupStepperRow({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}) {
  // 고를 숫자 목록·보여 줄 글자(단위 붙임)
  const options = useMemo(() => buildOptions(min, max, step), [min, max, step])
  const displayOptions = useMemo(
    () => options.map((option) => (unit ? `${option}${unit}` : option)),
    [options, unit],
  )
  // 지금 값 순서 (목록에 없으면 첫 값)
  const index = Math.max(0, options.indexOf(value))

  return (
    <div className={SETUP_ROW_CLASS} data-setup-row>
      <div className="min-w-0 flex-1">
        <p className={SETUP_TITLE_CLASS}>{label}</p>
        {description ? <p className={SETUP_DESC_CLASS}>{description}</p> : null}
      </div>

      <Stepper
        options={displayOptions}
        index={index}
        onIndexChange={(nextIndex) => onChange(options[nextIndex])}
        ariaLabel={label}
        inputFieldSrc={GAME_SETUP_ASSETS.inputField}
        arrowSrc={GAME_SETUP_ASSETS.arrow}
        valueClassName="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(1.02rem,1.45vw,1.18rem)] font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
        valueWidthClassName={
          unit
            ? "relative w-[clamp(6.25rem,10.5vw,7.5rem)]"
            : "relative w-[clamp(5.5rem,9.5vw,6.75rem)]"
        }
        buttonClassName="group block w-[clamp(1.9rem,2.55vw,2.15rem)] cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default disabled:opacity-40"
        arrowWrapClassName="interactive-scale-sm block"
        arrowImageClassName="block h-auto w-full select-none"
      />
    </div>
  )
}
