// 좌우 화살표로 목록 값을 하나씩 넘기는 칸 (누르는 자리 44px)
// shared/settings 아래 StepperRow·ChoiceRow가 씀 (데스크톱 shared/ui/Stepper는 화면 파일이라 못 부름)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"

// 화살표 버튼 하나 (오른쪽은 같은 그림 뒤집기)
function ArrowButton({ look, label, disabled, flip, onClick }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} data-sfx-owner="explicit" onClick={onClick} className={look.arrow}>
      <PublicAsset src={GAME_SETUP_ASSETS.arrow} alt="" className={`${look.arrowImg} ${flip ? "rotate-180" : ""}`} />
    </button>
  )
}

// 끝에서 더 못 가고, 실제로 바뀔 때만 클릭 소리 (look = settingLooks의 stepper, widthClass = 값 칸 폭)
export default function Stepper({ look, options, index, onIndexChange, ariaLabel, widthClass }) {
  const move = (delta, event) => {
    const next = Math.max(0, Math.min(options.length - 1, index + delta))
    if (next === index) return
    dispatchUiSfx("ui-click", event)
    onIndexChange(next)
  }
  const group = look.named ? { role: "group", "aria-label": ariaLabel } : {}

  return (
    <div className={look.root} {...group}>
      <ArrowButton look={look} label={`${ariaLabel} 감소`} disabled={index <= 0} onClick={(e) => move(-1, e)} />
      <div className={`${look.box} ${widthClass}`}>
        <PublicAsset src={GAME_SETUP_ASSETS.inputField} alt="" className={look.boxImg} />
        <span
          aria-live="polite"
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:1rem] font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
        >
          {options[index]}
        </span>
      </div>
      <ArrowButton look={look} label={`${ariaLabel} 증가`} disabled={index >= options.length - 1} flip onClick={(e) => move(1, e)} />
    </div>
  )
}
