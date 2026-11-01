// 친구 목록 탭 (검색창·목록 오류·검색 결과 또는 폴더 세 개)
// FriendListPanelContent가 list 탭일 때 그림
import {
  FRIEND_LIST_STATUS_ERROR_CLASS,
  FRIEND_LIST_TAB_CLASS,
} from "../../../constants/friendListStyle.js"
import {
  FRIEND_LIST_FILTER_FIELDS,
  FRIEND_LIST_FILTER_SEARCH,
} from "../../../constants/friendListFilter.js"
import { mergeFriendGroups } from "../../../utils/filterFriendListItems.js"
import { useFriendListLocalFilter } from "../../../hooks/useFriendListLocalFilter.js"
import { useMemo } from "react"
import FriendListFilterResults from "./FriendListFilterResults.jsx"
import FriendListSearchBar from "../FriendListSearchBar.jsx"
import FriendListGroupFolders from "./FriendListGroupFolders.jsx"

// 검색은 세 묶음을 합친 목록에서 함, 검색 중엔 폴더 대신 결과만 보임
export default function FriendListTabContent({
  onlineFriends = [],
  offlineFriends = [],
  favoriteFriends = [],
  invite = null,
  block = null,
  friendsError = null,
  onRetry = null,
}) {
  const allFriends = useMemo(
    () => mergeFriendGroups({ onlineFriends, offlineFriends, favoriteFriends }),
    [onlineFriends, offlineFriends, favoriteFriends],
  )

  const { query, setQuery, isFiltering, filteredItems } = useFriendListLocalFilter(
    allFriends,
    FRIEND_LIST_FILTER_FIELDS.friend,
  )

  return (
    <div className={FRIEND_LIST_TAB_CLASS}>
      <FriendListSearchBar
        label={FRIEND_LIST_FILTER_SEARCH.listTab.label}
        placeholder={FRIEND_LIST_FILTER_SEARCH.listTab.placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {friendsError !== null ? (
        <p role="status" data-friend-list-error="true" className={`px-2 ${FRIEND_LIST_STATUS_ERROR_CLASS}`}>
          {friendsError}
          {onRetry !== null ? (
            <button type="button" onClick={onRetry} className="ml-2 underline" style={{ outline: "none" }}>
              다시 시도
            </button>
          ) : null}
        </p>
      ) : null}
      {isFiltering ? (
        <FriendListFilterResults friends={filteredItems} invite={invite} block={block} />
      ) : (
        <FriendListGroupFolders
          onlineFriends={onlineFriends}
          offlineFriends={offlineFriends}
          favoriteFriends={favoriteFriends}
          invite={invite}
          block={block}
        />
      )}
    </div>
  )
}
