import {
  FRIEND_LIST_TAB_CLASS,
  FRIEND_TAB_GROUP_GAP_CLASS,
  FRIEND_TAB_SCROLLABLE_LIST_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import {
  FRIEND_LIST_FILTER_FIELDS,
  FRIEND_LIST_FILTER_SEARCH,
} from "@/domains/lobby/constants/friendListFilter.js"
import {
  getFavoriteFriendLabel,
  getNormalFriendLabel,
  getOfflineFriendLabel,
} from "@/domains/lobby/utils/friendListGroupLabels.js"
import { mergeFriendGroups } from "@/domains/lobby/utils/filterFriendListItems.js"
import { useFriendListLocalFilter } from "@/domains/lobby/hooks/useFriendListLocalFilter.js"
import { useMemo } from "react"
import FriendListFilterResults from "@/domains/lobby/components/friendList/list/FriendListFilterResults.jsx"
import FriendListSearchBar from "@/domains/lobby/components/friendList/FriendListSearchBar.jsx"
import FriendListFolder from "@/domains/lobby/components/friendList/list/FriendListFolder.jsx"

// 일반/오프라인/즐겨찾기 그룹을 폴더로 보여줍니다.
function FriendListGroupFolders({ onlineFriends, offlineFriends, favoriteFriends, invite, block }) {
  return (
    <>
      <FriendListFolder
        label={getNormalFriendLabel(onlineFriends)}
        friends={onlineFriends}
        defaultOpen
        invite={invite}
        block={block}
      />
      <FriendListFolder
        className={FRIEND_TAB_GROUP_GAP_CLASS}
        label={getOfflineFriendLabel(offlineFriends)}
        friends={offlineFriends}
        listClassName={FRIEND_TAB_SCROLLABLE_LIST_CLASS}
        invite={invite}
        block={block}
      />
      <FriendListFolder
        className={FRIEND_TAB_GROUP_GAP_CLASS}
        label={getFavoriteFriendLabel(favoriteFriends)}
        friends={favoriteFriends}
        listClassName={FRIEND_TAB_SCROLLABLE_LIST_CLASS}
        invite={invite}
        block={block}
      />
    </>
  )
}

// 친구 목록 탭에서 검색바와 친구 그룹 3개를 보여주는 컴포넌트입니다.
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
      {/* 조회 실패를 빈 목록으로 위장하지 않는다 — 사실과 재시도를 함께 보여준다(AC-02). */}
      {friendsError !== null ? (
        <p role="status" data-friend-list-error="true" className="px-2 app-text-scaled [--app-text-size:11px] text-red-300/90">
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
