import {
  FRIEND_REQUEST_BACK_BUTTON_CLASS,
  FRIEND_REQUEST_EMPTY_CLASS,
  FRIEND_REQUEST_RESULT_LIST_CLASS,
  FRIEND_REQUEST_TAB_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { useFriendSearch } from "@/domains/lobby/hooks/useFriendSearch.js"
import BackButton from "@/shared/ui/BackButton.jsx"
import FriendListSearchBar from "@/domains/lobby/components/friendList/FriendListSearchBar.jsx"
import RecommendedFriendRow from "@/domains/lobby/components/friendList/request/RecommendedFriendRow.jsx"

// 친구 검색 결과 영역이 비어 있을 때 보여주는 문구입니다.
function FriendRequestEmptyState({ searching, errorMsg }) {
  const message = errorMsg || (searching ? "친구를 검색 중입니다." : "검색 결과가 없습니다.")

  return (
    <li className={FRIEND_REQUEST_EMPTY_CLASS}>
      {message}
    </li>
  )
}

// 친구 검색 결과 목록을 보여줍니다.
function FriendRequestResultsList({ results, searching, errorMsg, sentIds, onSend }) {
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
            profileSrc={friend.profile}
            online={friend.online || friend.status === "ONLINE"}
            onSend={onSend}
            sent={sentIds.has(friend.id)}
          />
        ))
      )}
    </ul>
  )
}

// 친구를 검색하고 친구 신청을 보내는 탭 화면입니다.
export default function FriendRequestTab({ onBack }) {
  const {
    query,
    setQuery,
    results,
    searching,
    sentIds,
    errorMsg,
    handleSearch,
    handleSend,
  } = useFriendSearch()

  return (
    <div className={FRIEND_REQUEST_TAB_CLASS}>
      <FriendListSearchBar
        label="친구 검색"
        placeholder="검색할 친구 닉네임 입력"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onSubmit={handleSearch}
      />
      <FriendRequestResultsList
        results={results}
        searching={searching}
        errorMsg={errorMsg}
        sentIds={sentIds}
        onSend={handleSend}
      />
      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className={FRIEND_REQUEST_BACK_BUTTON_CLASS}
      />
    </div>
  )
}
