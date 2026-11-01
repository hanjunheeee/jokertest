// 요청 수락 탭 (검색·전부 수락·결과 안내·오류·대상 없음 안내·신청 목록·뒤로)
// SheetBody가 accept 탭일 때 그림
import { FILTER_MSGS, FILTER_SEARCH, FRIEND_LIST_FILTER_FIELDS } from "@/domains/lobby/constants/friendListFilter.js"
import { ACCEPT_EMPTY_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import { useFriendListLocalFilter } from "@/domains/lobby/hooks/useFriendListLocalFilter.js"
import { buildAcceptAllSummary } from "@/domains/lobby/utils/friend/acceptAll.js"
import { SCROLL_CLASS } from "../sheetStyle.js"
import SearchBar from "../parts/SearchBar.jsx"
import BackRow from "../parts/BackRow.jsx"
import AcceptToolbar from "./AcceptToolbar.jsx"
import RequestRow from "./RequestRow.jsx"

// 데스크톱 FriendAcceptTab과 같은 순서·문구, 검색은 이 탭 안에서만 거름
// 대상 신청 없음 안내는 목록 오류가 없을 때만 (데스크톱 패널처럼 받았는지는 따로 안 봄)
export default function AcceptTab({
  onBack, incomingRequests, incomingError, processingRequestIds, acceptAllResult,
  onAccept, onBlock, onAcceptAll, onRefresh, targetRequestId,
}) {
  const { query, setQuery, isFiltering, filteredItems } = useFriendListLocalFilter(
    incomingRequests,
    FRIEND_LIST_FILTER_FIELDS.incomingRequest,
  )
  const visible = isFiltering ? filteredItems : incomingRequests
  const summary = buildAcceptAllSummary(acceptAllResult)
  const targetMissing = incomingError === null && targetRequestId != null
    && !incomingRequests.some((request) => request.request_id === targetRequestId)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchBar
        label={FILTER_SEARCH.acceptTab.label}
        placeholder={FILTER_SEARCH.acceptTab.placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <AcceptToolbar running={acceptAllResult?.running === true} onAcceptAll={onAcceptAll} onRefresh={onRefresh} />
      <div className={SCROLL_CLASS}>
        {summary !== null ? (
          <div role="status" data-accept-all-status="true" className={ACCEPT_EMPTY_CLASS}>
            <p>{summary}</p>
            {acceptAllResult.refreshError !== null && acceptAllResult.refreshError !== undefined ? (
              <p data-accept-all-refresh-error="true">{acceptAllResult.refreshError}</p>
            ) : null}
          </div>
        ) : null}
        {incomingError !== null ? (
          <p role="status" data-incoming-error="true" className={ACCEPT_EMPTY_CLASS}>{incomingError}</p>
        ) : null}
        {targetMissing ? (
          <p role="status" data-notification-target-missing="true" className={ACCEPT_EMPTY_CLASS}>
            알림에서 찾던 친구 요청은 이미 처리되었습니다.
          </p>
        ) : null}
        <ul className="mt-2">
          {visible.length === 0 ? (
            <li className={ACCEPT_EMPTY_CLASS}>{isFiltering ? FILTER_MSGS.noResults : FILTER_MSGS.noIncomingRequests}</li>
          ) : (
            visible.map((request) => (
              <RequestRow
                key={request.request_id || request.id}
                request={request}
                processing={processingRequestIds?.has?.(request.request_id) === true}
                targeted={targetRequestId != null && request.request_id === targetRequestId}
                onAccept={onAccept}
                onBlock={onBlock}
              />
            ))
          )}
        </ul>
      </div>
      <BackRow onBack={onBack} />
    </div>
  )
}
