import {
  GAME_MODE_INDICATOR_ASSETS,
  GAME_MODE_INDICATOR_LABELS,
} from "../constants/gameModeIndicatorAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const WRAP_CLASS =
  "absolute left-1/2 top-[2.5%] z-10 -translate-x-1/2 sm:top-[3%]"

const BADGE_CLASS =
  "relative min-w-[clamp(6.25rem,12.5vw,8.25rem)] shrink-0 border-0 bg-transparent p-0 leading-none"

const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-subheading text-[clamp(0.82rem,1.15vw,1rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 상단 가운데 현재 게임 유형 표시 (활성 버튼 1개) */
export default function GameModeTypeIndicator({
  label = GAME_MODE_INDICATOR_LABELS.multi,
}) {
  return (
    <div className={WRAP_CLASS} aria-label="게임 유형">
      <div className={BADGE_CLASS} aria-label={label}>
        <PublicAsset
          src={GAME_MODE_INDICATOR_ASSETS.tabActive}
          alt=""
          className="block h-auto w-full select-none"
        />
        <span className={LABEL_CLASS}>{label}</span>
      </div>
    </div>
  )
}
