// 위 줄 가운데 게임 유형 표시 (기본 "멀티플레이")
// 방 목록 페이지가 씀, 데스크톱 GameModeTypeIndicator와 같은 그림·글자
import {
  INDICATOR_ASSETS,
  INDICATOR_LABELS,
} from "@/domains/game/mode/constants/gameModeIndicatorAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 유형 표시 그림 + 글자
export default function TitleBadge({ label = INDICATOR_LABELS.multi }) {
  return (
    <div className="relative w-[min(42vw,9.5rem)] shrink-0 leading-none" role="heading" aria-level={1} aria-label={label}>
      <PublicAsset src={INDICATOR_ASSETS.tabActive} alt="" className="block h-auto w-full select-none" />
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-display app-text-scaled [--app-text-size:1.2rem] font-medium text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
        aria-hidden="true"
      >
        {label}
      </span>
    </div>
  )
}
