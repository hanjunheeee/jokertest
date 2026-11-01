// 진행 바 펼치기·접기 버튼: 틀 오른쪽 위 확대 표시 그림, 누름 칸은 44px
// 진행 바(Timebar)가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_TIMEBAR_ASSETS } from "@/domains/game/ingame/constants/timebar/ingameTimebarAssets.js"
import {
  COLLAPSE_BTN_LABEL,
  EXPAND_BTN_IMG_CLASS,
  EXPAND_BTN_LABEL,
} from "@/domains/game/ingame/constants/timebar/ingameTimebarLayout.js"

// 그림 크기·눌림은 데스크톱 확대 버튼 상수 그대로, 누름 칸만 틀 안쪽으로 넓힘 (가로 넘침 막기)
export default function ExpandButton({ expanded, onToggle }) {
  return (
    <button
      type="button"
      className="group pointer-events-auto absolute -top-3 -right-1 z-[6] flex h-11 w-11 cursor-pointer items-start justify-end border-0 bg-transparent p-0 leading-none"
      aria-label={expanded ? COLLAPSE_BTN_LABEL : EXPAND_BTN_LABEL}
      aria-expanded={expanded}
      data-ingame-timebar-expand=""
      onClick={onToggle}
    >
      <span className="block w-[clamp(1.58rem,7.6cqi,2.4rem)]">
        <PublicAsset src={INGAME_TIMEBAR_ASSETS.expandButton} alt="" className={EXPAND_BTN_IMG_CLASS} />
      </span>
    </button>
  )
}
