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

function FriendRequestEmptyState({ searching, errorMsg }) {
  const message = errorMsg
    || (searching ? "친구를 검색 중입니다." : FRIEND_LIST_FILTER_MESSAGES.noResults)

  return (
    <li className={FRIEND_REQUEST_EMPTY_CLASS}>
      {message}
    </li>
  )
}

function FriendRequestResultsList({ results, searching, errorMsg, sentIds, onSend, onBlock, blockingIds, isSearching }) {
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
