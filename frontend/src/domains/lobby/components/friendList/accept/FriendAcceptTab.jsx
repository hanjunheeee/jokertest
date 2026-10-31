import {
  FRIEND_ACCEPT_ALL_BUTTON_CLASS,
  FRIEND_ACCEPT_ALL_LABEL_CLASS,
  FRIEND_ACCEPT_BACK_BUTTON_CLASS,
  FRIEND_ACCEPT_BUTTON_IMAGE_CLASS,
  FRIEND_ACCEPT_EMPTY_CLASS,
  FRIEND_ACCEPT_LIST_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS,
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

function AcceptAllButton({ onClick, running }) {
  return (
    <button
      type="button"
      onClick={() => { if (!running) onClick?.() }}
      className={FRIEND_ACCEPT_ALL_BUTTON_CLASS}
      aria-label={running ? "전부 수락 처리 중" : "전부 수락"}
      aria-disabled={running}
      disabled={running}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.acceptAllButton}
        alt=""
        className={FRIEND_ACCEPT_BUTTON_IMAGE_CLASS}
      />
      <span className={FRIEND_ACCEPT_ALL_LABEL_CLASS}>{running ? "처리 중…" : "전부 수락"}</span>
    </button>
  )
}

export function buildAcceptAllSummary(result) {
  if (result === null || result === undefined) return null
  if (result.running) return "받은 요청을 하나씩 처리하는 중입니다…"
  if (result.completedAt === null) return null

  const parts = []
  if (result.accepted > 0) parts.push(`${result.accepted}건 수락`)
  if (result.failed > 0) parts.push(`${result.failed}건 실패`)
  if (result.unconfirmed > 0) parts.push(`${result.unconfirmed}건은 결과를 확정하지 못했습니다`)
  if (parts.length === 0) parts.push("처리할 요청이 없었습니다")
  return parts.join(" · ")
}

function FriendAcceptAllStatus({ result }) {
  const summary = buildAcceptAllSummary(result)
  if (summary === null) return null

  return (
    <div role="status" data-accept-all-status="true" className={FRIEND_ACCEPT_EMPTY_CLASS}>
      <p>{summary}</p>
      {result.refreshError !== null && result.refreshError !== undefined ? (
        <p data-accept-all-refresh-error="true">{result.refreshError}</p>
      ) : null}
    </div>
  )
}

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
        className={FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS}
      />
    </button>
  )
}

function FriendAcceptToolbar({ onAcceptAll, onRefresh, acceptAllRunning }) {
  return (
    <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
      <AcceptAllButton onClick={onAcceptAll} running={acceptAllRunning} />
      <FriendAcceptRefreshButton onClick={onRefresh} />
    </div>
  )
}

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

function FriendAcceptRequestList({
  incomingRequests, isFiltering, onAccept, onBlock, processingRequestIds, targetRequestId,
}) {
  return (
    <ul className={FRIEND_ACCEPT_LIST_CLASS}>
      {incomingRequests.length === 0 ? (
        <FriendAcceptEmptyState isFiltering={isFiltering} />
      ) : (
        incomingRequests.map((request) => (
          <IncomingFriendRow
            key={request.request_id || request.id}
            requestId={request.request_id}
            requesterId={request.id}
            name={request.name}
            accountProfilePhotoId={request.accountProfilePhotoId}
            accountProfileBorderId={request.accountProfileBorderId}
            onAccept={onAccept}
            onBlock={onBlock}
            processing={processingRequestIds?.has?.(request.request_id) === true}
            targeted={targetRequestId != null && request.request_id === targetRequestId}
          />
        ))
      )}
    </ul>
  )
}

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
