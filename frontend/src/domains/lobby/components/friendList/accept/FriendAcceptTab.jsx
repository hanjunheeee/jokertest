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

// 받은 친구 요청을 한 번에 모두 수락하는 버튼입니다.
// F-19(AC-02): 처리 중에는 비활성이다 — 연타가 같은 요청을 두 번 처리하지 않게 하는 첫
// 방어선이고, 실제 중복 방지는 useFriendListSync의 요청 단위 잠금이 담당한다.
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

/**
 * F-19(AC-02): 전체 수락 결과를 성공·실패·확정 못 함으로 **나누어** 안내한다.
 *
 * 모든 호출이 정착하기 전에는 아무 완료 안내도 하지 않는다(running). 정착한 뒤에는 세 수를
 * 각각 보여주고, 목록 재조회가 실패했으면 그 사실을 처리 결과와 **별도로** 알린다 —
 * 재조회 실패가 "수락이 실패했다"로 읽히면 안 된다.
 */
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
        className={FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS}
      />
    </button>
  )
}

// 받은 친구 요청 탭 상단의 전부 수락/새로고침 버튼 영역입니다.
function FriendAcceptToolbar({ onAcceptAll, onRefresh, acceptAllRunning }) {
  return (
    <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
      <AcceptAllButton onClick={onAcceptAll} running={acceptAllRunning} />
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
            // F-19(AC-04): 차단은 요청 id가 아니라 상대 UUID로 동작한다 — 서버가 내려주는
            // 신청자 uuid를 그대로 넘긴다.
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

// 받은 친구 요청을 검색하고 수락하는 탭 화면입니다.
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

  // 대상 존재 여부는 **필터 이전의 실제 목록**으로 판단한다 — 검색어 때문에 잠시 가려진
  // 요청을 "이미 처리됨"으로 잘못 안내하지 않기 위해서다.
  //
  // F-19(AC-02): 정상 조회가 끝난 뒤에만 "대상 없음"으로 확정한다. 조회가 실패했거나 아직
  // 끝나지 않았으면 목록이 비어 있다는 사실이 "그 요청이 처리됐다"는 증거가 아니다.
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
