import { PODIUM_ASSETS } from "@/domains/podium/constants/podiumAssets.js"
import {
  PODIUM_TABLE_NAV_ARROW_BTN_BASE,
  PODIUM_TABLE_NAV_ARROW_IMG_CLASS,
  PODIUM_TABLE_NAV_ARROW_NEXT_CLASS,
  PODIUM_TABLE_NAV_ARROW_PREV_CLASS,
} from "@/domains/podium/constants/podiumLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/** 랭킹 테이블 좌/우 페이지 화살표 */
export default function PodiumRankingTableNavArrow({
  direction = "prev",
  disabled = false,
  onClick,
}) {
  const isNext = direction === "next"
  const positionClass = isNext ? PODIUM_TABLE_NAV_ARROW_NEXT_CLASS : PODIUM_TABLE_NAV_ARROW_PREV_CLASS

  return (
    <button
      type="button"
      aria-label={isNext ? "다음 페이지" : "이전 페이지"}
      disabled={disabled}
      onClick={onClick}
      className={`${PODIUM_TABLE_NAV_ARROW_BTN_BASE} ${positionClass}`}
    >
      <PublicAsset
        src={PODIUM_ASSETS.pageArrow}
        alt=""
        className={`${PODIUM_TABLE_NAV_ARROW_IMG_CLASS}${isNext ? " rotate-180" : ""}`}
      />
    </button>
  )
}
