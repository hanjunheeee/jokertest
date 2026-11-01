// 친구 목록 탭 (검색·목록 오류·검색 결과 또는 폴더 세 개)
// SheetBody가 list 탭일 때 그림
import { useMemo } from "react"
import { FILTER_MSGS, FILTER_SEARCH, FRIEND_LIST_FILTER_FIELDS } from "@/domains/lobby/constants/friendListFilter.js"
import {
  FILTER_EMPTY_CLASS,
  FRIEND_LIST_TAB_CLASS,
  STATUS_ERROR_CLASS,
  TAB_GROUP_GAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { mergeFriendGroups } from "@/domains/lobby/utils/filterFriendListItems.js"
import { getFavoriteFriendLabel, getNormalFriendLabel, getOfflineFriendLabel } from "@/domains/lobby/utils/friendListGroupLabels.js"
import { useFriendListLocalFilter } from "@/domains/lobby/hooks/useFriendListLocalFilter.js"
import { SCROLL_CLASS } from "../sheetStyle.js"
import SearchBar from "../parts/SearchBar.jsx"
import FriendFolder from "./FriendFolder.jsx"
import FriendRow from "./FriendRow.jsx"

// 데스크톱 FriendListTabContent와 같은 갈래: 검색은 세 묶음을 합친 목록에서, 검색 중엔 폴더 대신 결과만
export default function ListTab({ groups, friendsError, onRetry, invite, block }) {
  const { onlineFriends, offlineFriends, favoriteFriends } = groups
  const allFriends = useMemo(
    () => mergeFriendGroups({ onlineFriends, offlineFriends, favoriteFriends }),
    [onlineFriends, offlineFriends, favoriteFriends],
  )
  const { query, setQuery, isFiltering, filteredItems } = useFriendListLocalFilter(allFriends, FRIEND_LIST_FILTER_FIELDS.friend)

  return (
    <div className={`${FRIEND_LIST_TAB_CLASS} flex-1`}>
      <SearchBar
        label={FILTER_SEARCH.listTab.label}
        placeholder={FILTER_SEARCH.listTab.placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {/* 목록 못 받았으면 오류 + 다시 시도 */}
      {friendsError !== null ? (
        <p role="status" data-friend-list-error="true" className={`px-2 ${STATUS_ERROR_CLASS}`}>
          {friendsError}
          {onRetry !== null ? (
            <button type="button" onClick={onRetry} className="ml-2 min-h-11 cursor-pointer border-0 bg-transparent p-0 text-inherit underline">
              다시 시도
            </button>
          ) : null}
        </p>
      ) : null}
      <div className={`${SCROLL_CLASS} pb-2`}>
        {isFiltering ? (
          filteredItems.length === 0 ? <p className={FILTER_EMPTY_CLASS}>{FILTER_MSGS.noResults}</p> : (
            <ul className="mt-2" aria-label="친구 검색 결과">
              {filteredItems.map((friend) => <FriendRow key={friend.id} friend={friend} invite={invite} block={block} />)}
            </ul>
          )
        ) : (
          <>
            <FriendFolder label={getNormalFriendLabel(onlineFriends)} friends={onlineFriends} defaultOpen invite={invite} block={block} />
            <FriendFolder className={TAB_GROUP_GAP_CLASS} label={getOfflineFriendLabel(offlineFriends)} friends={offlineFriends} invite={invite} block={block} />
            <FriendFolder className={TAB_GROUP_GAP_CLASS} label={getFavoriteFriendLabel(favoriteFriends)} friends={favoriteFriends} invite={invite} block={block} />
          </>
        )}
      </div>
    </div>
  )
}
