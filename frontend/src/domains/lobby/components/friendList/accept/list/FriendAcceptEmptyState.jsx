// 받은 친구 신청 목록이 비었을 때 한 줄
// FriendAcceptRequestList가 그림
import { FRIEND_ACCEPT_EMPTY_CLASS } from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_FILTER_MESSAGES } from "../../../../constants/friendListFilter.js"

// 검색 중이면 결과 없음, 아니면 받은 신청 없음 문구
export default function FriendAcceptEmptyState({ isFiltering }) {
  const message = isFiltering
    ? FRIEND_LIST_FILTER_MESSAGES.noResults
    : FRIEND_LIST_FILTER_MESSAGES.noIncomingRequests

  return (
    <li className={FRIEND_ACCEPT_EMPTY_CLASS}>
      {message}
    </li>
  )
}
