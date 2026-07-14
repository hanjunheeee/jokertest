// 파일 역할: GameModeTypeIndicator.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  GAME_MODE_INDICATOR_ASSETS,
  GAME_MODE_INDICATOR_LABELS,
} from "@/domains/game/mode/constants/gameModeIndicatorAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const WRAP_CLASS = "absolute left-1/2 top-[2.5%] z-10 -translate-x-1/2 sm:top-[3%]"
const BADGE_CLASS = "relative min-w-[clamp(11rem,20vw,14rem)] shrink-0 border-0 bg-transparent p-0 leading-none"
const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-display text-[clamp(2rem,3vw,2.3rem)] font-medium text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 현재 게임 유형을 화면 상단 배지로 보여줍니다.
export default function GameModeTypeIndicator({ label = GAME_MODE_INDICATOR_LABELS.multi }) {
  return (
    <div className={WRAP_CLASS} aria-label="게임 유형">
      <div className={BADGE_CLASS} aria-label={label}>
        <PublicAsset src={GAME_MODE_INDICATOR_ASSETS.tabActive} alt="" className="block h-auto w-full select-none" />
        <span className={LABEL_CLASS}>{label}</span>
      </div>
    </div>
  )
}
