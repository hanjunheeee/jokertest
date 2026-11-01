// 친구 검색 결과 목록
// FriendRequestTab이 검색창 아래에 그림
import { FRIEND_REQUEST_RESULT_LIST_CLASS } from "../../../../constants/friendListStyle.js"
import RecommendedFriendRow from "../RecommendedFriendRow.jsx"
import FriendRequestEmptyState from "./FriendRequestEmptyState.jsx"

// 검색어가 없으면 목록 자체를 안 그림
export default function FriendRequestResultsList({ results, searching, errorMsg, sentIds, onSend, onBlock, blockingIds, isSearching }) {
  if (!isSearching) return null

  return (
    <ul className={FRIEND_REQUEST_RESULT_LIST_CLASS}>
      {results.length === 0 ? (
        <FriendRequestEmptyState searching={searching} errorMsg={errorMsg} />
      ) : (
        results.map((friend) => (
          <RecommendedFriendRow
            key={friend.id}
            id={friend.id}
            name={friend.name}
            status={friend.status}
            accountProfilePhotoId={friend.accountProfilePhotoId}
            accountProfileBorderId={friend.accountProfileBorderId}
            onSend={onSend}
            onBlock={onBlock}
            blocking={blockingIds.has(friend.id)}
            sent={sentIds.has(friend.id)}
          />
        ))
      )}
    </ul>
  )
}
