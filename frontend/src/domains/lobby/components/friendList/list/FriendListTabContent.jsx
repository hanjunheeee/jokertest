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
function FriendListGroupFolders({ onlineFriends, offlineFriends, favoriteFriends }) {
  return (
    <>
      <FriendListFolder
        label={getNormalFriendLabel(onlineFriends)}
        friends={onlineFriends}
        defaultOpen
      />
      <FriendListFolder
        className={FRIEND_TAB_GROUP_GAP_CLASS}
        label={getOfflineFriendLabel(offlineFriends)}
        friends={offlineFriends}
        listClassName={FRIEND_TAB_SCROLLABLE_LIST_CLASS}
      />
      <FriendListFolder
        className={FRIEND_TAB_GROUP_GAP_CLASS}
        label={getFavoriteFriendLabel(favoriteFriends)}
        friends={favoriteFriends}
        listClassName={FRIEND_TAB_SCROLLABLE_LIST_CLASS}
      />
    </>
  )
}

// 친구 목록 탭에서 검색바와 친구 그룹 3개를 보여주는 컴포넌트입니다.
export default function FriendListTabContent({
  onlineFriends = [],
  offlineFriends = [],
  favoriteFriends = [],
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
      {isFiltering ? (
        <FriendListFilterResults friends={filteredItems} />
      ) : (
        <FriendListGroupFolders
          onlineFriends={onlineFriends}
          offlineFriends={offlineFriends}
          favoriteFriends={favoriteFriends}
        />
      )}
    </div>
  )
}
