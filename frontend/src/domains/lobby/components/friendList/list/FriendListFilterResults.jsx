import { FRIEND_LIST_FILTER_MESSAGES } from "@/domains/lobby/constants/friendListFilter.js"
import {
  FRIEND_LIST_FILTER_EMPTY_CLASS,
  FRIEND_LIST_FILTER_RESULT_LIST_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import FriendListRow from "@/domains/lobby/components/friendList/list/FriendListRow.jsx"

// 기본 탭에서 검색어에 맞는 친구 목록을 검색창 아래에 보여줍니다.
export default function FriendListFilterResults({ friends }) {
  if (friends.length === 0) {
    return (
      <p className={FRIEND_LIST_FILTER_EMPTY_CLASS}>
        {FRIEND_LIST_FILTER_MESSAGES.noResults}
      </p>
    )
  }

  return (
    <ul className={FRIEND_LIST_FILTER_RESULT_LIST_CLASS} aria-label="친구 검색 결과">
      {friends.map((friend) => (
        <FriendListRow
          key={friend.id}
          id={friend.id}
          name={friend.name}
          online={friend.online || friend.status === "ONLINE"}
        />
      ))}
    </ul>
  )
}
