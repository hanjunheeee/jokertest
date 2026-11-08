// 받은 친구 신청 줄 목록
// FriendAcceptTab이 검색 결과 또는 전체 신청을 넘겨 그림
import { ACCEPT_LIST_CLASS } from "../../../../constants/friendListStyle.js"
import IncomingFriendRow from "../IncomingFriendRow.jsx"
import FriendAcceptEmptyState from "./FriendAcceptEmptyState.jsx"

// 처리 중인 신청은 잠그고, 알림에서 찾던 신청은 표시함
export default function FriendAcceptRequestList({
  incomingRequests, isFiltering, onAccept, onDecline = null, onBlock, processingRequestIds, targetRequestId,
  requestErrors = {}, blockErrors = {}, blockingIds = null, listFailed = false,
}) {
  return (
    <ul className={ACCEPT_LIST_CLASS}>
      {/* 목록을 못 받았으면 위 오류 줄만, "받은 신청 없음"은 거짓 안내라 안 띄움 */}
      {incomingRequests.length === 0 && listFailed ? null : incomingRequests.length === 0 ? (
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
            onDecline={onDecline}
            onBlock={onBlock}
            processing={processingRequestIds?.has?.(request.request_id) === true}
            blocking={blockingIds?.has?.(request.id) === true}
            error={requestErrors[request.request_id] ?? blockErrors[request.id] ?? null}
            targeted={targetRequestId != null && request.request_id === targetRequestId}
          />
        ))
      )}
    </ul>
  )
}
