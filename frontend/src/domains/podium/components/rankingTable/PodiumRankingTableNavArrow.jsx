import { PODIUM_ASSETS } from "../../constants/podiumAssets.js"
import {
  TABLE_NAV_ARROW_BTN_BASE,
  TABLE_NAV_ARROW_IMG_CLASS,
  TABLE_NAV_ARROW_NEXT_CLASS,
  TABLE_NAV_ARROW_PREV_CLASS,
} from "../../constants/podiumLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function PodiumRankingTableNavArrow({
  direction = "prev",
  disabled = false,
  onClick,
}) {
  const isNext = direction === "next"
  const positionClass = isNext ? TABLE_NAV_ARROW_NEXT_CLASS : TABLE_NAV_ARROW_PREV_CLASS

  return (
    <button
      type="button"
      aria-label={isNext ? "다음 페이지" : "이전 페이지"}
      disabled={disabled}
      onClick={onClick}
      className={`${TABLE_NAV_ARROW_BTN_BASE} ${positionClass}`}
    >
      <PublicAsset
        src={PODIUM_ASSETS.pageArrow}
        alt=""
        className={`${TABLE_NAV_ARROW_IMG_CLASS}${isNext ? " rotate-180" : ""}`}
      />
    </button>
  )
}
