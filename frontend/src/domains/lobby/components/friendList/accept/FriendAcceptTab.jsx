import {
  FRIEND_ACCEPT_ALL_BUTTON_CLASS,
  FRIEND_ACCEPT_ALL_LABEL_CLASS,
  FRIEND_ACCEPT_BACK_BUTTON_CLASS,
  FRIEND_ACCEPT_BUTTON_IMAGE_CLASS,
  FRIEND_ACCEPT_EMPTY_CLASS,
  FRIEND_ACCEPT_LIST_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_CLASS,
  FRIEND_ACCEPT_TAB_CLASS,
  FRIEND_ACCEPT_TOOLBAR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import {
  FRIEND_LIST_FILTER_FIELDS,
  FRIEND_LIST_FILTER_MESSAGES,
  FRIEND_LIST_FILTER_SEARCH,
} from "@/domains/lobby/constants/friendListFilter.js"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { useFriendListLocalFilter } from "@/domains/lobby/hooks/useFriendListLocalFilter.js"
import BackButton from "@/shared/ui/BackButton.jsx"
import FriendListSearchBar from "@/domains/lobby/components/friendList/FriendListSearchBar.jsx"
import IncomingFriendRow from "@/domains/lobby/components/friendList/accept/IncomingFriendRow.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

// 받은 친구 요청을 한 번에 모두 수락하는 버튼입니다.
function AcceptAllButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={FRIEND_ACCEPT_ALL_BUTTON_CLASS}
      aria-label="전부 수락"
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.acceptAllButton}
        alt=""
        className={FRIEND_ACCEPT_BUTTON_IMAGE_CLASS}
      />
      <span className={FRIEND_ACCEPT_ALL_LABEL_CLASS}>전부 수락</span>
    </button>
  )
}

// 받은 친구 요청 목록을 다시 가져오는 새로고침 버튼입니다.
function FriendAcceptRefreshButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="친구 신청 목록 새로고침"
      className={FRIEND_ACCEPT_REFRESH_BUTTON_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.refreshButton}
        alt=""
        className={FRIEND_ACCEPT_BUTTON_IMAGE_CLASS}
      />
    </button>
  )
}

// 받은 친구 요청 탭 상단의 전부 수락/새로고침 버튼 영역입니다.
function FriendAcceptToolbar({ onAcceptAll, onRefresh }) {
  return (
    <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
      <AcceptAllButton onClick={onAcceptAll} />
      <FriendAcceptRefreshButton onClick={onRefresh} />
    </div>
  )
}

// 받은 친구 요청이 없을 때 보여주는 빈 상태 문구입니다.
function FriendAcceptEmptyState({ isFiltering }) {
  const message = isFiltering
    ? FRIEND_LIST_FILTER_MESSAGES.noResults
    : FRIEND_LIST_FILTER_MESSAGES.noIncomingRequests

  return (
    <li className={FRIEND_ACCEPT_EMPTY_CLASS}>
      {message}
    </li>
  )
}

// 받은 친구 요청 목록을 렌더링합니다.
function FriendAcceptRequestList({ incomingRequests, isFiltering, onAccept, onDecline, targetRequestId }) {
  return (
    <ul className={FRIEND_ACCEPT_LIST_CLASS}>
      {incomingRequests.length === 0 ? (
        <FriendAcceptEmptyState isFiltering={isFiltering} />
      ) : (
        incomingRequests.map((request) => (
          <IncomingFriendRow
            key={request.request_id || request.id}
            requestId={request.request_id}
            name={request.name}
            onAccept={onAccept}
            onDecline={onDecline}
            targeted={targetRequestId != null && request.request_id === targetRequestId}
          />
        ))
      )}
    </ul>
  )
}

/**
 * F-17(AC-02): 알림에서 지정한 요청이 실제 받은 요청 목록에 더 이상 없을 때의 안내.
 *
 * 이미 수락·거절된(또는 취소된) 요청이라는 뜻이다 — 그 요청을 다시 만들거나 자동으로
 * 수락하지 않는다. 사용자가 "왜 아무 것도 강조되지 않는지" 알 수 있게 사실만 알린다.
 */
function FriendAcceptTargetMissingNotice() {
  return (
    <p
      role="status"
      data-notification-target-missing="true"
      className={FRIEND_ACCEPT_EMPTY_CLASS}
    >
      알림에서 찾던 친구 요청은 이미 처리되었습니다.
    </p>
  )
}

// 받은 친구 요청을 검색하고 수락/거절하는 탭 화면입니다.
export default function FriendAcceptTab({
  onBack,
  incomingRequests = [],
  onAccept,
  onDecline,
  onAcceptAll,
  onRefresh,
  targetRequestId = null,
}) {
  const { query, setQuery, isFiltering, filteredItems } = useFriendListLocalFilter(
    incomingRequests,
    FRIEND_LIST_FILTER_FIELDS.incomingRequest,
  )

  const visibleRequests = isFiltering ? filteredItems : incomingRequests

  // 대상 존재 여부는 **필터 이전의 실제 목록**으로 판단한다 — 검색어 때문에 잠시 가려진
  // 요청을 "이미 처리됨"으로 잘못 안내하지 않기 위해서다.
  const targetMissing =
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
      <FriendAcceptToolbar onAcceptAll={onAcceptAll} onRefresh={onRefresh} />
      {targetMissing ? <FriendAcceptTargetMissingNotice /> : null}
      <FriendAcceptRequestList
        incomingRequests={visibleRequests}
        isFiltering={isFiltering}
        onAccept={onAccept}
        onDecline={onDecline}
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
