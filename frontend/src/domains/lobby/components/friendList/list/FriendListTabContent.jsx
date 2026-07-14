import {
  FRIEND_TAB_GROUP_GAP_CLASS,
  FRIEND_TAB_SCROLLABLE_LIST_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import {
  getFavoriteFriendLabel,
  getNormalFriendLabel,
  getOfflineFriendLabel,
} from "@/domains/lobby/utils/friendListGroupLabels.js"
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
  return (
    <>
      <FriendListSearchBar />
      <FriendListGroupFolders
        onlineFriends={onlineFriends}
        offlineFriends={offlineFriends}
        favoriteFriends={favoriteFriends}
      />
    </>
  )
}
