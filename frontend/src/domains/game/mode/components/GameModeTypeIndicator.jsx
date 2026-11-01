import {
  INDICATOR_ASSETS,
  INDICATOR_LABELS,
} from "@/domains/game/mode/constants/gameModeIndicatorAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const SIZE_CLASS = {
  default: {
    wrap: "absolute left-1/2 top-[2.5%] z-10 -translate-x-1/2 sm:top-[3%]",
    badge: "relative min-w-[clamp(11rem,20vw,14rem)] shrink-0 border-0 bg-transparent p-0 leading-none",
    label:
      "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-display app-text-scaled [--app-text-size:clamp(2rem,3vw,2.3rem)] font-medium text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]",
  },
  compact: {
    wrap: "absolute left-1/2 top-[1.2%] z-10 -translate-x-1/2 sm:top-[1.5%]",
    badge: "relative min-w-[clamp(7.5rem,13vw,9.5rem)] shrink-0 border-0 bg-transparent p-0 leading-none",
    label:
      "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-display app-text-scaled [--app-text-size:clamp(1.3rem,2vw,1.55rem)] font-medium text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]",
  },
}

export default function GameModeTypeIndicator({ label = INDICATOR_LABELS.multi, size = "default" }) {
  const classes = SIZE_CLASS[size] ?? SIZE_CLASS.default

  return (
    <div className={classes.wrap} aria-label="게임 유형">
      <div className={classes.badge} aria-label={label}>
        <PublicAsset src={INDICATOR_ASSETS.tabActive} alt="" className="block h-auto w-full select-none" />
        <span className={classes.label}>{label}</span>
      </div>
    </div>
  )
}
