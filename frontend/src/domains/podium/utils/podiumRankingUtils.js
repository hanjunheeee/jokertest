/** 테이블 첫 순위 · 페이지당 5+5열 = 10명 */
export const PODIUM_TABLE_START_RANK = 4
export const PODIUM_TABLE_RANKS_PER_PAGE = 10
export const PODIUM_TABLE_LEFT_COLUMN_SIZE = 5

export function getPodiumTopThree(ranking) {
  return ranking.filter((entry) => entry.rank <= 3)
}

export function getPodiumTablePageCount(rankingLength) {
  const tableEntryCount = Math.max(0, rankingLength - 3)
  if (tableEntryCount === 0) return 1
  return Math.ceil(tableEntryCount / PODIUM_TABLE_RANKS_PER_PAGE)
}

/** activePage 0 → 4~13위, 1 → 14~23위 … */
export function splitPodiumTablePage(ranking, activePage = 0) {
  const pageStartRank = PODIUM_TABLE_START_RANK + activePage * PODIUM_TABLE_RANKS_PER_PAGE
  const pageEndRank = pageStartRank + PODIUM_TABLE_RANKS_PER_PAGE - 1
  const leftEndRank = pageStartRank + PODIUM_TABLE_LEFT_COLUMN_SIZE - 1

  const pageEntries = ranking.filter(
    (entry) => entry.rank >= pageStartRank && entry.rank <= pageEndRank,
  )

  return {
    tableLeft: pageEntries.filter((entry) => entry.rank <= leftEndRank),
    tableRight: pageEntries.filter((entry) => entry.rank > leftEndRank),
    pageStartRank,
    pageEndRank,
  }
}
