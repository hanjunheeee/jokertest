/** 친구 목록 패널 public 에셋 경로 (frontend/public 기준) */
export const FRIEND_LIST_ASSETS = {
  panelFrame: "/frame/friendList/친구목록 탭 프레임.png",
  rowFrame: "/frame/friendList/찢어진 비단 프레임.png",
  onlineBadge: "/frame/friendList/접속중 표시.png",
  searchInput: "/button/friendList/검색 입력창.png",
  sectionPlate: "/button/입력창1.png",
  folderClosed: "/button/friendList/닫힌 폴더.png",
  folderOpen: "/button/friendList/열린폴더.png",
  chevronUp: "/button/friendList/upper꺽쇠.png",
  chevronDown: "/button/friendList/lower꺽쇠.png",
  dummyProfile1: "/button/friendList/더미친구 프로필1.png",
  dummyProfile2: "/button/friendList/더미친구 프로필2.png",
  dummyProfile3: "/button/friendList/더미친구 프로필3.png",
  dummyProfile4: "/button/friendList/더미친구 프로필4.png",
  dummyProfile5: "/button/friendList/더미친구 프로필5.png",
}

/** 일반 폴더 더미 친구 (online: 접속 중 표시 여부) */
export const DUMMY_ONLINE_FRIENDS = [
  {
    id: "grave-robber",
    name: "Grave_Robber",
    profile: FRIEND_LIST_ASSETS.dummyProfile1,
    online: true,
  },
  {
    id: "venetian-rose",
    name: "Venetian_Rose",
    profile: FRIEND_LIST_ASSETS.dummyProfile2,
    online: false,
  },
  {
    id: "shadow-cloak",
    name: "Shadow_Cloak",
    profile: FRIEND_LIST_ASSETS.dummyProfile3,
    online: true,
  },
  {
    id: "court-jester",
    name: "Court_Jester",
    profile: FRIEND_LIST_ASSETS.dummyProfile4,
    online: false,
  },
]

/** 즐겨찾기 폴더 더미 친구 (레이아웃용) */
export const DUMMY_FAVORITE_FRIENDS = [
  {
    id: "wax-seal",
    name: "Wax_Seal",
    profile: FRIEND_LIST_ASSETS.dummyProfile3,
    online: true,
  },
  {
    id: "midnight-dealer",
    name: "Midnight_Dealer",
    profile: FRIEND_LIST_ASSETS.dummyProfile4,
    online: false,
  },
]

/** 오프라인 폴더 더미 친구 */
export const DUMMY_OFFLINE_FRIENDS = [
  {
    id: "masked-noble",
    name: "Masked_Noble",
    profile: FRIEND_LIST_ASSETS.dummyProfile5,
    online: false,
  },
  {
    id: "plague-scribe",
    name: "Plague_Scribe",
    profile: FRIEND_LIST_ASSETS.dummyProfile2,
    online: false,
  },
]

export function countOnlineFriends(friends) {
  return friends.filter((friend) => friend.online).length
}
