import {
  countOnlineFriends,
  DUMMY_FAVORITE_FRIENDS,
  DUMMY_OFFLINE_FRIENDS,
  DUMMY_ONLINE_FRIENDS,
} from "../../../constants/friendListAssets.js"
import FriendListSearchBar from "../common/FriendListSearchBar.jsx"
import FriendListFolder from "./FriendListFolder.jsx"

const SCROLLABLE_LIST_CLASS = "mt-1 max-h-[12rem] overflow-y-auto pr-0.5"

/** prototype 친구목록 창 — 폴더 목록 탭 본문 */
export default function FriendListTabContent() {
  return (
    <>
      <FriendListSearchBar />

      <FriendListFolder
        className="mt-4"
        label={`일반 (${countOnlineFriends(DUMMY_ONLINE_FRIENDS)}/${DUMMY_ONLINE_FRIENDS.length})`}
        friends={DUMMY_ONLINE_FRIENDS}
        defaultOpen
      />

      <FriendListFolder
        className="mt-3.5"
        label={`오프라인 (${DUMMY_OFFLINE_FRIENDS.length})`}
        friends={DUMMY_OFFLINE_FRIENDS}
        listClassName={SCROLLABLE_LIST_CLASS}
      />

      <FriendListFolder
        className="mt-3.5"
        label={`즐겨찾기 (${countOnlineFriends(DUMMY_FAVORITE_FRIENDS)}/${DUMMY_FAVORITE_FRIENDS.length})`}
        friends={DUMMY_FAVORITE_FRIENDS}
        listClassName={SCROLLABLE_LIST_CLASS}
      />
    </>
  )
}
