import {
  TABLE_PAGE_NODE_ACTIVE_CLASS,
  TABLE_PAGE_NODE_BASE_CLASS,
  TABLE_PAGE_NODES_WRAP_CLASS,
} from "../../constants/podiumLayoutStyle.js"

export default function PodiumRankingTablePageNodes({
  pageCount,
  activePage,
  onSelectPage,
}) {
  return (
    <div className={TABLE_PAGE_NODES_WRAP_CLASS} role="tablist" aria-label="랭킹 페이지 선택">
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
            className={`${TABLE_PAGE_NODE_BASE_CLASS}${
              active ? ` ${TABLE_PAGE_NODE_ACTIVE_CLASS}` : ""
            }`}
          />
        )
      })}
    </div>
  )
}
