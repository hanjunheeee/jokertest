import PodiumRankingTableColumn from "@/domains/podium/components/rankingTable/PodiumRankingTableColumn.jsx"
import { PODIUM_ASSETS } from "@/domains/podium/constants/podiumAssets.js"
import {
  PODIUM_TABLE_COLUMNS_CLASS,
  PODIUM_TABLE_FRAME_IMAGE_CLASS,
  PODIUM_TABLE_INSET_CLASS,
  PODIUM_TABLE_OVERLAY_CLASS,
  PODIUM_TABLE_SECTION_CLASS,
} from "@/domains/podium/constants/podiumLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/** 랭킹테이블 프레임 안 2열 (좌 5명 · 우 5명) */
export default function PodiumRankingTable({
  leftRanking,
  rightRanking,
  pageLabel = "4~13위",
  pageNavSlot = null,
}) {
  return (
    <section className={PODIUM_TABLE_SECTION_CLASS} aria-label={`${pageLabel} 랭킹`}>
      <PublicAsset
        src={PODIUM_ASSETS.rankingTableFrame}
        alt=""
        className={PODIUM_TABLE_FRAME_IMAGE_CLASS}
      />
      <div className={PODIUM_TABLE_OVERLAY_CLASS}>
        <div className={PODIUM_TABLE_INSET_CLASS}>
          <div className={PODIUM_TABLE_COLUMNS_CLASS}>
            <PodiumRankingTableColumn ranking={leftRanking} />
            <PodiumRankingTableColumn ranking={rightRanking} />
          </div>
        </div>
        {pageNavSlot}
      </div>
    </section>
  )
}
