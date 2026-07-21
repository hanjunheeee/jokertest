// 파일 역할: GameModeTypeIndicator.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  GAME_MODE_INDICATOR_ASSETS,
  GAME_MODE_INDICATOR_LABELS,
} from "@/domains/game/mode/constants/gameModeIndicatorAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// size별 클래스 세트입니다. "default"는 기존 화면과 완전히 동일한 값이라 size를 넘기지 않는
// 모든 호출부는 지금과 똑같이 렌더됩니다. "compact"는 정보 밀도가 높은 화면(공개방 목록 등)에서
// 제목 영역 높이를 줄이고 싶을 때만 명시적으로 사용합니다.
const SIZE_CLASS = {
  default: {
    wrap: "absolute left-1/2 top-[2.5%] z-10 -translate-x-1/2 sm:top-[3%]",
    badge: "relative min-w-[clamp(11rem,20vw,14rem)] shrink-0 border-0 bg-transparent p-0 leading-none",
    label:
      "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-display text-[clamp(2rem,3vw,2.3rem)] font-medium text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]",
  },
  compact: {
    wrap: "absolute left-1/2 top-[1.2%] z-10 -translate-x-1/2 sm:top-[1.5%]",
    badge: "relative min-w-[clamp(7.5rem,13vw,9.5rem)] shrink-0 border-0 bg-transparent p-0 leading-none",
    label:
      "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-display text-[clamp(1.3rem,2vw,1.55rem)] font-medium text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]",
  },
}

// 현재 게임 유형을 화면 상단 배지로 보여줍니다.
export default function GameModeTypeIndicator({ label = GAME_MODE_INDICATOR_LABELS.multi, size = "default" }) {
  const classes = SIZE_CLASS[size] ?? SIZE_CLASS.default

  return (
    <div className={classes.wrap} aria-label="게임 유형">
      <div className={classes.badge} aria-label={label}>
        <PublicAsset src={GAME_MODE_INDICATOR_ASSETS.tabActive} alt="" className="block h-auto w-full select-none" />
        <span className={classes.label}>{label}</span>
      </div>
    </div>
  )
}
