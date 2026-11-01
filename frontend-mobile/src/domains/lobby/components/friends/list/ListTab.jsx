// 친구 목록 탭 (검색·목록 오류·불러오는 중·친구 없음·검색 결과 또는 폴더 세 개·동작 메뉴)
// SheetBody가 list 탭일 때 그림
import { useMemo, useState } from "react"
import { FILTER_MSGS, FILTER_SEARCH, FRIEND_LIST_FILTER_FIELDS } from "@/domains/lobby/constants/friendListFilter.js"
import { mergeFriendGroups } from "@/domains/lobby/utils/filterFriendListItems.js"
import { getFavoriteFriendLabel, getNormalFriendLabel, getOfflineFriendLabel } from "@/domains/lobby/utils/friendListGroupLabels.js"
import { useFriendListLocalFilter } from "@/domains/lobby/hooks/useFriendListLocalFilter.js"
import { LIST_CLASS } from "../sheetStyle.js"
import SearchBar from "../parts/SearchBar.jsx"
import Notice from "../parts/Notice.jsx"
import FriendFolder from "./FriendFolder.jsx"
import FriendRow from "./FriendRow.jsx"
import FriendMenu from "./FriendMenu.jsx"

// 검색은 세 묶음을 합친 목록에서 함, 고른 친구는 id로 들고 있어 목록이 바뀌어도 최신 값으로 메뉴를 그림
export default function ListTab({ groups, friendsError, loaded, onRetry, invite, block, onGoAdd }) {
  const { onlineFriends, offlineFriends, favoriteFriends } = groups
  const allFriends = useMemo(
    () => mergeFriendGroups({ onlineFriends, offlineFriends, favoriteFriends }),
    [onlineFriends, offlineFriends, favoriteFriends],
  )
  const { query, setQuery, isFiltering, filteredItems } = useFriendListLocalFilter(allFriends, FRIEND_LIST_FILTER_FIELDS.friend)
  const [menuFriendId, setMenuFriendId] = useState(null)
  const menuFriend = allFriends.find((friend) => friend.id === menuFriendId) ?? null
  const openMenu = (friend) => setMenuFriendId(friend.id)
  const noFriends = allFriends.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchBar
        label={FILTER_SEARCH.listTab.label}
        placeholder={FILTER_SEARCH.listTab.placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={LIST_CLASS}>
        {friendsError !== null ? (
          <Notice tone="error" actionLabel="다시 시도" onAction={onRetry} data-friend-list-error="true">{friendsError}</Notice>
        ) : null}
        {!loaded && friendsError === null && noFriends ? <Notice>친구 목록을 불러오는 중입니다.</Notice> : null}
        {loaded && friendsError === null && noFriends && !isFiltering ? (
          <Notice actionLabel="친구 추가하러 가기" onAction={onGoAdd}>아직 친구가 없습니다.</Notice>
        ) : null}
        {isFiltering ? (
          filteredItems.length === 0 ? <Notice>{FILTER_MSGS.noResults}</Notice> : (
            <ul aria-label="친구 검색 결과">
              {filteredItems.map((friend) => <FriendRow key={friend.id} friend={friend} onOpenMenu={openMenu} />)}
            </ul>
          )
        ) : null}
        {!isFiltering && !noFriends ? (
          <>
            <FriendFolder label={getNormalFriendLabel(onlineFriends)} friends={onlineFriends} defaultOpen onOpenMenu={openMenu} />
            <FriendFolder label={getOfflineFriendLabel(offlineFriends)} friends={offlineFriends} onOpenMenu={openMenu} />
            <FriendFolder label={getFavoriteFriendLabel(favoriteFriends)} friends={favoriteFriends} onOpenMenu={openMenu} />
          </>
        ) : null}
      </div>
      {menuFriend !== null ? (
        <FriendMenu friend={menuFriend} invite={invite} block={block} onClose={() => setMenuFriendId(null)} />
      ) : null}
    </div>
  )
}
