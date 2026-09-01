import {
  PODIUM_TABLE_PAGE_NODE_ACTIVE_CLASS,
  PODIUM_TABLE_PAGE_NODE_BASE_CLASS,
  PODIUM_TABLE_PAGE_NODES_WRAP_CLASS,
} from "@/domains/podium/constants/podiumLayoutStyle.js"

/** 랭킹 테이블 하단 — 튜토리얼과 동일한 원형 노드 페이지 UI */
export default function PodiumRankingTablePageNodes({
  pageCount,
  activePage,
  onSelectPage,
}) {
  return (
    <div className={PODIUM_TABLE_PAGE_NODES_WRAP_CLASS} role="tablist" aria-label="랭킹 페이지 선택">
      {Array.from({ length: pageCount }, (_, index) => {
        const active = index === activePage

        return (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${index + 1}페이지`}
            onClick={() => onSelectPage?.(index)}
            className={`${PODIUM_TABLE_PAGE_NODE_BASE_CLASS}${
              active ? ` ${PODIUM_TABLE_PAGE_NODE_ACTIVE_CLASS}` : ""
            }`}
          />
        )
      })}
    </div>
  )
}
