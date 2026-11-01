// 요청 수락 탭 (검색·전부 수락·결과 안내·오류·대상 없음 안내·불러오는 중·신청 목록)
// SheetBody가 accept 탭일 때 그림
import { FILTER_MSGS, FILTER_SEARCH, FRIEND_LIST_FILTER_FIELDS } from "@/domains/lobby/constants/friendListFilter.js"
import { useFriendListLocalFilter } from "@/domains/lobby/hooks/useFriendListLocalFilter.js"
import { buildAcceptAllSummary } from "@/domains/lobby/utils/friend/acceptAll.js"
import { LIST_CLASS } from "../sheetStyle.js"
import SearchBar from "../parts/SearchBar.jsx"
import Notice from "../parts/Notice.jsx"
import AcceptToolbar from "./AcceptToolbar.jsx"
import RequestRow from "./RequestRow.jsx"

// 검색은 이 탭 안에서만 거름, 대상 신청 없음 안내는 목록을 제대로 받았을 때만 보임 (데스크톱 FriendAcceptTab과 같음)
export default function AcceptTab({
  incomingRequests, incomingError, loaded, processingRequestIds, acceptAllResult,
  onAccept, onBlock, onAcceptAll, onRefresh, targetRequestId,
}) {
  const { query, setQuery, isFiltering, filteredItems } = useFriendListLocalFilter(
    incomingRequests,
    FRIEND_LIST_FILTER_FIELDS.incomingRequest,
  )
  const visible = isFiltering ? filteredItems : incomingRequests
  const summary = buildAcceptAllSummary(acceptAllResult)
  const targetMissing = loaded && incomingError === null && targetRequestId != null
    && !incomingRequests.some((request) => request.request_id === targetRequestId)
  const emptyText = isFiltering ? FILTER_MSGS.noResults : loaded ? FILTER_MSGS.noIncomingRequests : "받은 요청을 불러오는 중입니다."

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchBar
        label={FILTER_SEARCH.acceptTab.label}
        placeholder={FILTER_SEARCH.acceptTab.placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <AcceptToolbar running={acceptAllResult?.running === true} onAcceptAll={onAcceptAll} onRefresh={onRefresh} />
      <div className={LIST_CLASS}>
        {summary !== null ? (
          <Notice tone="info" data-accept-all-status="true">
            {summary}
            {acceptAllResult.refreshError ? <span className="block">{acceptAllResult.refreshError}</span> : null}
          </Notice>
        ) : null}
        {incomingError !== null ? <Notice tone="error" data-incoming-error="true">{incomingError}</Notice> : null}
        {targetMissing ? (
          <Notice data-notification-target-missing="true">알림에서 찾던 친구 요청은 이미 처리되었습니다.</Notice>
        ) : null}
        {visible.length === 0 ? <Notice>{emptyText}</Notice> : (
          <ul aria-label="받은 친구 요청">
            {visible.map((request) => (
              <RequestRow
                key={request.request_id || request.id}
                request={request}
                processing={processingRequestIds?.has?.(request.request_id) === true}
                targeted={targetRequestId != null && request.request_id === targetRequestId}
                onAccept={onAccept}
                onBlock={onBlock}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
