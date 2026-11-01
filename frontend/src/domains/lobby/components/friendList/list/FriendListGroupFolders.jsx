// 검색 안 할 때의 친구 폴더 세 개 (접속·오프라인·즐겨찾기)
// FriendListTabContent가 그림
import {
  FRIEND_TAB_GROUP_GAP_CLASS,
  FRIEND_TAB_SCROLLABLE_LIST_CLASS,
} from "../../../constants/friendListStyle.js"
import {
  getFavoriteFriendLabel,
  getNormalFriendLabel,
  getOfflineFriendLabel,
} from "../../../utils/friendListGroupLabels.js"
import FriendListFolder from "./FriendListFolder.jsx"

// 접속 중 폴더만 처음부터 펼침, 나머지는 길어질 수 있어 스크롤 목록을 씀
export default function FriendListGroupFolders({ onlineFriends, offlineFriends, favoriteFriends, invite, block }) {
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
