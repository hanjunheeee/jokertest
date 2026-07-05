/**
 * 설정 목록 stepper 한 줄 — 제목·설명(선택) + min~max 화살표 증감
 * SetupTabContent에서 type: "stepper" 항목에 사용
 *
 * props
 * - label: 항목 제목
 * - description: 부가 설명 (없으면 미표시)
 * - value: 현재 숫자 값
 * - min, max, step: 선택 가능 범위·간격 (회의 탭은 step 30초)
 * - unit: 표시 접미사 (예: "초", 없으면 숫자만)
 * - onChange: 화살표로 값 변경 시 다음 숫자 전달
 */
import { useMemo } from "react"
import { GAME_SETUP_ASSETS } from "../../constants/gameSetupAssets.js"
import {
  SETUP_DESC_CLASS,
  SETUP_ROW_CLASS,
  SETUP_TITLE_CLASS,
} from "../../constants/setupRowStyles.js"
import Stepper from "@/shared/ui/Stepper"

/** min부터 max까지 step 간격으로 선택지 배열 생성 */
function buildOptions(min, max, step = 1) {
  const options = []
  for (let current = min; current <= max; current += step) {
    options.push(current)
  }
  return options
}

/** 공유 Stepper에 게임 설정 에셋·스타일을 입힌 숫자 조절 행 */
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
  // useMemo(계산 함수, 의존성 배열)는 의존성 값이 바뀔 때만 계산을 다시 실행해서
  // 그 결과를 재사용하는 훅입니다. 매 렌더링마다 buildOptions를 다시 돌리지 않고
  // min·max·step이 바뀔 때만 선택 가능한 값 배열을 새로 계산합니다.
  const options = useMemo(() => buildOptions(min, max, step), [min, max, step])
  // options나 unit이 바뀔 때만 화면에 표시할 문자열 배열(예: "30초")을 다시 계산
  const displayOptions = useMemo(
    () => options.map((option) => (unit ? `${option}${unit}` : option)),
    [options, unit],
  )
  const index = Math.max(0, options.indexOf(value)) // value가 목록에 없으면 첫 칸으로

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
        valueClassName="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(1.02rem,1.45vw,1.18rem)] font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
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
