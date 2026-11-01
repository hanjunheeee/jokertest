// 받은 친구 신청 줄 목록
// FriendAcceptTab이 검색 결과 또는 전체 신청을 넘겨 그림
import { FRIEND_ACCEPT_LIST_CLASS } from "../../../../constants/friendListStyle.js"
import IncomingFriendRow from "../IncomingFriendRow.jsx"
import FriendAcceptEmptyState from "./FriendAcceptEmptyState.jsx"

// 처리 중인 신청은 잠그고, 알림에서 찾던 신청은 표시함
export default function FriendAcceptRequestList({
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
