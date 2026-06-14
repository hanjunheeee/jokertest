import FriendListSearchBar from "../common/FriendListSearchBar.jsx"
import FriendListFolder from "./FriendListFolder.jsx"

const SCROLLABLE_LIST_CLASS = "mt-1 max-h-[12rem] overflow-y-auto pr-0.5"

/**
 * @desc 친구목록 창 — 폴더 목록 탭 본문 (실제 API 연동 버전)
 * @param {Array} onlineFriends - 일반(온라인) 친구 배열
 * @param {Array} offlineFriends - 오프라인 친구 배열
 * @param {Array} favoriteFriends - 즐겨찾기 친구 배열
 */
export default function FriendListTabContent({
  onlineFriends = [],
  offlineFriends = [],
  favoriteFriends = []
}) {
  // 더미 데이터용 유틸 함수 대신, Props로 받은 데이터에서 접속 중인 인원을 계산합니다.
  const countOnline = (friends) => 
    friends.filter(friend => friend.online || friend.status === 'ONLINE').length;

  return (
    <>
      <FriendListSearchBar />

      {/* 1. 일반 (온라인) 친구 폴더 */}
      <FriendListFolder
        className="mt-4"
        label={`일반 (${countOnline(onlineFriends)}/${onlineFriends.length})`}
        friends={onlineFriends}
        defaultOpen
      />

      {/* 2. 오프라인 친구 폴더 */}
      <FriendListFolder
        className="mt-3.5"
        label={`오프라인 (${offlineFriends.length})`}
        friends={offlineFriends}
        listClassName={SCROLLABLE_LIST_CLASS}
      />

      {/* 3. 즐겨찾기 친구 폴더 */}
      <FriendListFolder
        className="mt-3.5"
        label={`즐겨찾기 (${countOnline(favoriteFriends)}/${favoriteFriends.length})`}
        friends={favoriteFriends}
        listClassName={SCROLLABLE_LIST_CLASS}
      />
    </>
  )
}