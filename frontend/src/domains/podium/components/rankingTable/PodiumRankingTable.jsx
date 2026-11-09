// 4등 아래 순위표 틀: 왼쪽·오른쪽 두 줄 묶음
// PodiumRankingTableShell만 씀
import PodiumRankingTableColumn from "./PodiumRankingTableColumn.jsx"
import { PODIUM_ASSETS } from "../../constants/podiumAssets.js"
import {
  TABLE_COLUMNS_CLASS,
  TABLE_FRAME_IMG_CLASS,
  TABLE_INSET_CLASS,
  TABLE_OVERLAY_CLASS,
  TABLE_SECTION_CLASS,
} from "../../constants/podiumLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function PodiumRankingTable({
  leftRanking,
  rightRanking,
  pageLabel = "4~13위",
  pageNavSlot = null,
}) {
  return (
    <section className={TABLE_SECTION_CLASS} aria-label={`${pageLabel} 랭킹`}>
      <PublicAsset
        src={PODIUM_ASSETS.rankingTableFrame}
        alt=""
        className={TABLE_FRAME_IMG_CLASS}
      />
      <div className={TABLE_OVERLAY_CLASS}>
        <div className={TABLE_INSET_CLASS}>
          <div className={TABLE_COLUMNS_CLASS}>
            <PodiumRankingTableColumn ranking={leftRanking} />
            <PodiumRankingTableColumn ranking={rightRanking} />
          </div>
        </div>
        {pageNavSlot}
      </div>
    </section>
  )
}
