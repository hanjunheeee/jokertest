// 받은 친구 신청 탭 (검색·전부 수락·오류·대상 없음 안내·신청 목록·뒤로)
// FriendListPanelContent가 accept 탭일 때 그림
import { FRIEND_ACCEPT_BACK_BUTTON_CLASS, FRIEND_ACCEPT_EMPTY_CLASS, FRIEND_ACCEPT_TAB_CLASS } from "../../../constants/friendListStyle.js"
import { FRIEND_LIST_FILTER_FIELDS, FRIEND_LIST_FILTER_SEARCH } from "../../../constants/friendListFilter.js"
import { useFriendListLocalFilter } from "../../../hooks/useFriendListLocalFilter.js"
import BackButton from "../../../../../shared/ui/BackButton.jsx"
import FriendListSearchBar from "../FriendListSearchBar.jsx"
import FriendAcceptToolbar from "./toolbar/FriendAcceptToolbar.jsx"
import FriendAcceptAllStatus from "./status/FriendAcceptAllStatus.jsx"
import FriendAcceptTargetMissingNotice from "./status/FriendAcceptTargetMissingNotice.jsx"
import FriendAcceptRequestList from "./list/FriendAcceptRequestList.jsx"

export { buildAcceptAllSummary } from "../../../utils/friend/acceptAllSummary.js"

// 검색은 이 탭 안에서만 거름, 대상 신청 없음 안내는 목록을 제대로 받았을 때만 보임
export default function FriendAcceptTab({
  onBack,
  incomingRequests = [],
  onAccept,
  onBlock = null,
  onAcceptAll,
  onRefresh,
  targetRequestId = null,
  processingRequestIds = new Set(),
  acceptAllResult = null,
  incomingError = null,
  incomingLoaded = true,
}) {
  const { query, setQuery, isFiltering, filteredItems } = useFriendListLocalFilter(
    incomingRequests,
    FRIEND_LIST_FILTER_FIELDS.incomingRequest,
  )

  const visibleRequests = isFiltering ? filteredItems : incomingRequests

  const targetMissing =
    incomingLoaded &&
    incomingError === null &&
    targetRequestId != null &&
    !incomingRequests.some((request) => request.request_id === targetRequestId)

  return (
    <div className={FRIEND_ACCEPT_TAB_CLASS}>
      <FriendListSearchBar
        label={FRIEND_LIST_FILTER_SEARCH.acceptTab.label}
        placeholder={FRIEND_LIST_FILTER_SEARCH.acceptTab.placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <FriendAcceptToolbar
        onAcceptAll={onAcceptAll}
        onRefresh={onRefresh}
        acceptAllRunning={acceptAllResult?.running === true}
      />
      <FriendAcceptAllStatus result={acceptAllResult} />
      {incomingError !== null ? (
        <p role="status" data-incoming-error="true" className={FRIEND_ACCEPT_EMPTY_CLASS}>
          {incomingError}
        </p>
      ) : null}
      {targetMissing ? <FriendAcceptTargetMissingNotice /> : null}
      <FriendAcceptRequestList
        incomingRequests={visibleRequests}
        isFiltering={isFiltering}
        onAccept={onAccept}
        onBlock={onBlock}
        processingRequestIds={processingRequestIds}
        targetRequestId={targetRequestId}
      />
      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className={FRIEND_ACCEPT_BACK_BUTTON_CLASS}
      />
    </div>
  )
}
