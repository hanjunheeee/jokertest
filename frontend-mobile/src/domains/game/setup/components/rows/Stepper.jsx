// 좌우 화살표로 목록 값을 하나씩 넘기는 칸 (모바일, 누르는 자리 44px)
// rows/StepperRow·ChoiceRow가 씀 (데스크톱 shared/ui/Stepper는 화면 파일이라 못 부름)
import PublicAsset from "@/shared/ui/PublicAsset"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"

const ARROW_BTN_CLASS =
  "group flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 disabled:opacity-35"

// 화살표 버튼 하나 (오른쪽은 같은 그림 뒤집기)
function ArrowButton({ label, disabled, flip, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      data-sfx-owner="explicit"
      onClick={onClick}
      className={ARROW_BTN_CLASS}
    >
      <PublicAsset
        src={GAME_SETUP_ASSETS.arrow}
        alt=""
        className={`block w-6 select-none transition-transform group-active:scale-90 ${flip ? "rotate-180" : ""}`}
      />
    </button>
  )
}

// 목록 칸: 끝에서 더 못 가고, 실제로 바뀔 때만 클릭 소리
export default function Stepper({ options, index, onIndexChange, ariaLabel, wide = false }) {
  const move = (delta, event) => {
    const next = Math.max(0, Math.min(options.length - 1, index + delta))
    if (next === index) return
    dispatchUiSfx("ui-click", event)
    onIndexChange(next)
  }

  return (
    <div className="ml-auto flex shrink-0 items-center" role="group" aria-label={ariaLabel}>
      <ArrowButton label={`${ariaLabel} 감소`} disabled={index <= 0} onClick={(e) => move(-1, e)} />
      <div className={`relative h-9 ${wide ? "w-30" : "w-26"}`}>
        <PublicAsset
          src={GAME_SETUP_ASSETS.inputField}
          alt=""
          className="block h-full w-full select-none object-fill"
        />
        <span
          aria-live="polite"
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:1rem] font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
        >
          {options[index]}
        </span>
      </div>
      <ArrowButton
        label={`${ariaLabel} 증가`}
        disabled={index >= options.length - 1}
        flip
        onClick={(e) => move(1, e)}
      />
    </div>
  )
}
