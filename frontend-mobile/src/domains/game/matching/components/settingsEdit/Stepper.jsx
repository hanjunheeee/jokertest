// 좌우 화살표로 목록 값을 하나씩 넘기는 칸 (누를 자리 44px)
// 설정 숫자 줄·고르기 줄이 씀, 데스크톱 shared/ui/Stepper는 못 불러서 같은 동작으로 따로 둠
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"

const ARROW_BTN_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-90 disabled:cursor-default disabled:opacity-35"

// 끝에서 더 못 가게 자르고, 실제로 바뀔 때만 클릭 소리
export default function Stepper({ options, index, onIndexChange, ariaLabel, valueWidthClass = "w-[6.25rem]" }) {
  const atMin = index <= 0
  const atMax = index >= options.length - 1

  // 한 칸 옮기기
  const move = (delta, event) => {
    const next = Math.max(0, Math.min(options.length - 1, index + delta))
    if (next === index) return
    dispatchUiSfx("ui-click", event)
    onIndexChange(next)
  }

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`${ariaLabel} 감소`}
        disabled={atMin}
        data-sfx-owner="explicit"
        onClick={(event) => move(-1, event)}
        className={ARROW_BTN_CLASS}
      >
        <PublicAsset src={GAME_SETUP_ASSETS.arrow} alt="" className="block h-auto w-7 select-none" />
      </button>
      <div className={`relative ${valueWidthClass}`}>
        <PublicAsset src={GAME_SETUP_ASSETS.inputField} alt="" className="block h-9 w-full select-none object-fill" />
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:1rem] font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
          aria-live="polite"
        >
          {options[index]}
        </span>
      </div>
      {/* 같은 화살표 그림을 뒤집어 씀 */}
      <button
        type="button"
        aria-label={`${ariaLabel} 증가`}
        disabled={atMax}
        data-sfx-owner="explicit"
        onClick={(event) => move(1, event)}
        className={ARROW_BTN_CLASS}
      >
        <PublicAsset src={GAME_SETUP_ASSETS.arrow} alt="" className="block h-auto w-7 rotate-180 select-none" />
      </button>
    </div>
  )
}
