import { useMemo, useState } from "react"
import PodiumRankingTable from "@/domains/podium/components/rankingTable/PodiumRankingTable.jsx"
import PodiumRankingTableNavArrow from "@/domains/podium/components/rankingTable/PodiumRankingTableNavArrow.jsx"
import PodiumRankingTablePageNodes from "@/domains/podium/components/rankingTable/PodiumRankingTablePageNodes.jsx"
import {
  getPodiumTablePageCount,
  splitPodiumTablePage,
} from "@/domains/podium/utils/podiumRankingUtils.js"
import {
  PODIUM_TABLE_AREA_CLASS,
  PODIUM_TABLE_ROW_CLASS,
} from "@/domains/podium/constants/podiumLayoutStyle.js"

/** 랭킹 테이블 + 좌우 화살표 + 하단 노드 */
export default function PodiumRankingTableShell({ ranking }) {
  const [activePage, setActivePage] = useState(0)
  const pageCount = useMemo(() => getPodiumTablePageCount(ranking.length), [ranking.length])
  const lastPageIndex = pageCount - 1
  const safeActivePage = Math.min(activePage, lastPageIndex)
  const { tableLeft, tableRight, pageStartRank, pageEndRank } = useMemo(
    () => splitPodiumTablePage(ranking, safeActivePage),
    [ranking, safeActivePage],
  )

  const goPrevPage = () => setActivePage((prev) => Math.max(0, prev - 1))
  const goNextPage = () => setActivePage((prev) => Math.min(lastPageIndex, prev + 1))

  return (
    <div className={PODIUM_TABLE_AREA_CLASS}>
      <div className={PODIUM_TABLE_ROW_CLASS}>
        <PodiumRankingTable
          leftRanking={tableLeft}
          rightRanking={tableRight}
          pageLabel={`${pageStartRank}~${pageEndRank}위`}
          pageNavSlot={
            <PodiumRankingTablePageNodes
              pageCount={pageCount}
              activePage={safeActivePage}
              onSelectPage={setActivePage}
            />
          }
        />
        <PodiumRankingTableNavArrow
          direction="prev"
          disabled={safeActivePage <= 0}
          onClick={goPrevPage}
        />
        <PodiumRankingTableNavArrow
          direction="next"
          disabled={safeActivePage >= lastPageIndex}
          onClick={goNextPage}
        />
      </div>
    </div>
  )
}
