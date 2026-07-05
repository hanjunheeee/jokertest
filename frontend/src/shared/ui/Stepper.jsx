/**
 * 좌우 화살표로 options 배열 인덱스를 바꾸는 스테퍼
 * SetupStepperRow, GeneralSettingsTab 등에서 에셋·스타일 주입해 사용
 *
 * props
 * - options: 표시 문자열 배열 (또는 숫자+단위 조합)
 * - index / defaultIndex: 제어·비제어 모드 (index 있으면 제어)
 * - onIndexChange: 인덱스 변경 시 호출
 * - ariaLabel: 좌·우 버튼 접근성 접두
 * - inputFieldSrc, arrowSrc: 가운데 필드·화살표 PNG
 * - valueClassName, valueWidthClassName, buttonClassName 등: 호출부 커스텀 스타일
 */
import { useState } from "react"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 화살표·입력창 이미지로 옵션 목록을 순환하는 스테퍼 */
export default function Stepper({
  options, // 화면에 순서대로 보여줄 문자열(혹은 숫자+단위) 배열
  defaultIndex = 0, // 비제어 모드일 때 최초로 보여줄 인덱스
  index: controlledIndex, // 부모가 인덱스를 직접 관리하고 싶을 때 넘기는 값 (제어 모드로 전환됨)
  onIndexChange, // 화살표 클릭으로 인덱스가 바뀔 때마다 호출되는 콜백. 바뀐 인덱스를 인자로 넘겨줌
  ariaLabel, // 좌/우 버튼 접근성 라벨의 접두어 (예: "볼륨 감소"/"볼륨 증가")
  inputFieldSrc, // 가운데 값 표시 프레임 이미지
  arrowSrc, // 좌우 화살표 이미지 (오른쪽 화살표는 180도 회전해서 재사용)
  valueClassName = "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.98rem,1.35vw,1.08rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
  valueWidthClassName = "relative w-[clamp(7.25rem,13vw,9.25rem)]",
  buttonClassName = "block w-[clamp(1.9rem,2.55vw,2.15rem)] cursor-pointer border-0 bg-transparent p-0 opacity-90 hover:opacity-100 disabled:cursor-default disabled:opacity-40",
  arrowWrapClassName = "block",
  arrowImageClassName = "block h-auto w-full select-none",
}) {
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅입니다.
  // 값을 바꾸는 함수를 호출하면 컴포넌트가 다시 렌더링되어 화면이 최신 상태로 갱신됩니다.
  // internalIndex는 "비제어 모드"(부모가 index를 넘기지 않았을 때)에서 이 컴포넌트가
  // 스스로 기억하는 현재 인덱스입니다.
  const [internalIndex, setInternalIndex] = useState(defaultIndex)
  const isControlled = controlledIndex !== undefined // index prop 있으면 부모가 상태 소유
  const index = isControlled ? controlledIndex : internalIndex // 표시·조작에 쓸 현재 인덱스
  const value = options[index] // 가운데 입력창에 보여 줄 문자열
  const atMin = index === 0 // 첫 옵션이면 감소 버튼 비활성
  const atMax = index === options.length - 1 // 마지막 옵션이면 증가 버튼 비활성

  /** 화살표 클릭 시 인덱스 계산·클램프 후 내부 state 또는 onIndexChange로 반영 */
  const updateIndex = (next) => {
    const resolved = typeof next === "function" ? next(index) : next
    const clamped = Math.max(0, Math.min(options.length - 1, resolved))
    if (!isControlled) setInternalIndex(clamped)
    onIndexChange?.(clamped)
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${ariaLabel} 감소`}
        disabled={atMin}
        onClick={() => updateIndex((prev) => prev - 1)}
        className={buttonClassName}
      >
        <span className={arrowWrapClassName}>
          <PublicAsset
            src={arrowSrc}
            alt=""
            className={arrowImageClassName}
          />
        </span>
      </button>
      <div className={valueWidthClassName}>
        <PublicAsset
          src={inputFieldSrc}
          alt=""
          className="block h-auto w-full select-none"
        />
        <span className={valueClassName}>{value}</span>
      </div>
      <button
        type="button"
        aria-label={`${ariaLabel} 증가`}
        disabled={atMax}
        onClick={() => updateIndex((prev) => prev + 1)}
        className={buttonClassName}
      >
        <span className={arrowWrapClassName}>
          <PublicAsset
            src={arrowSrc}
            alt=""
            className={`${arrowImageClassName} rotate-180`}
          />
        </span>
      </button>
    </div>
  )
}
