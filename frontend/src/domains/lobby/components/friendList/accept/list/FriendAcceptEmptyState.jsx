// 받은 친구 신청 목록이 비었을 때 한 줄
// FriendAcceptRequestList가 그림
import { ACCEPT_EMPTY_CLASS } from "../../../../constants/friendListStyle.js"
import { FILTER_MSGS } from "../../../../constants/friendListFilter.js"

// 검색 중이면 결과 없음, 아니면 받은 신청 없음 문구
export default function FriendAcceptEmptyState({ isFiltering }) {
  const message = isFiltering
    ? FILTER_MSGS.noResults
    : FILTER_MSGS.noIncomingRequests

  return (
    <li className={ACCEPT_EMPTY_CLASS}>
      {message}
    </li>
  )
}
