import {
  FRIEND_LIST_FILTER_MESSAGES,
} from "@/domains/lobby/constants/friendListFilter.js"
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
  const message = errorMsg
    || (searching ? "친구를 검색 중입니다." : FRIEND_LIST_FILTER_MESSAGES.noResults)

  return (
    <li className={FRIEND_REQUEST_EMPTY_CLASS}>
      {message}
    </li>
  )
}

// 친구 검색 결과 목록을 보여줍니다.
// F-19(AC-01): 서버가 내려준 status(ONLINE/OFFLINE/UNKNOWN)를 **그대로** 넘긴다. 예전에는
// `friend.online || friend.status === "ONLINE"`으로 boolean 하나를 만들어, 서버가 구분해
// 내려준 "모름"을 오프라인으로 뭉갰다.
function FriendRequestResultsList({ results, searching, errorMsg, sentIds, onSend, onBlock, blockingIds, isSearching }) {
  // 검색어가 비어 있으면 결과 목록 자체를 그리지 않습니다.
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

// 친구를 검색하고 친구 신청을 보내는 탭 화면입니다.
export default function FriendRequestTab({ onBack, onBlock, blockingIds = new Set() }) {
  const {
    query,
    setQuery,
    results,
    searching,
    isSearching,
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
        isSearching={isSearching}
        errorMsg={errorMsg}
        sentIds={sentIds}
        onSend={handleSend}
        onBlock={onBlock}
        blockingIds={blockingIds}
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
