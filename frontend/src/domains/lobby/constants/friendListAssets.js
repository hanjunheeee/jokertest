/** 친구 목록 패널 public 에셋 경로 (frontend/public 기준) */
export const FRIEND_LIST_ASSETS = {
  openButton: "/button/친구목록 버튼.png",
  panelFrame: "/frame/friendList/친구목록 탭 프레임.png",
  rowFrame: "/frame/friendList/찢어진 비단 프레임.png",
  profileFrame: "/frame/friendList/친구 프로필 프레임.png",
  recommendedTag: "/frame/friendList/추천친구 태그.png",
  refreshButton: "/button/새로고침 버튼.png",
  onlineBadge: "/frame/friendList/접속중 표시.png",
  searchInput: "/button/friendList/검색 입력창.png",
  sectionPlate: "/button/입력창1.png",
  folderClosed: "/button/friendList/닫힌 폴더.png",
  folderOpen: "/button/friendList/열린폴더.png",
  chevronUp: "/button/friendList/upper꺽쇠.png",
  chevronDown: "/button/friendList/lower꺽쇠.png",
  friendBlockButton: "/button/friendList/친구차단버튼.png",
  acceptAllButton: "/button/버튼(수락 및 긍정).png",
  tabButtonInactive: "/button/버튼(미선택).png",
  tabButtonActive: "/button/버튼(수락 및 긍정).png",
  dummyProfile1: "/button/friendList/더미친구 프로필1.png",
  dummyProfile2: "/button/friendList/더미친구 프로필2.png",
  dummyProfile3: "/button/friendList/더미친구 프로필3.png",
  dummyProfile4: "/button/friendList/더미친구 프로필4.png",
  dummyProfile5: "/button/friendList/더미친구 프로필5.png",
}

/** prototype 친구 신청 창2 — 추천 친구 더미 */
export const DUMMY_RECOMMENDED_FRIENDS = [
  {
    id: "grave-robber-x",
    name: "Grave_Robber_X",
    profile: FRIEND_LIST_ASSETS.dummyProfile1,
    online: true,
  },
  {
    id: "venetian-rose",
    name: "Venetian_Rose",
    profile: FRIEND_LIST_ASSETS.dummyProfile2,
    online: true,
  },
  {
    id: "shadow-cloak",
    name: "Shadow_Cloak",
    profile: FRIEND_LIST_ASSETS.dummyProfile3,
    online: false,
  },
  {
    id: "court-jester",
    name: "Court_Jester",
    profile: FRIEND_LIST_ASSETS.dummyProfile4,
    online: true,
  },
  {
    id: "masked-noble",
    name: "Masked_Noble",
    profile: FRIEND_LIST_ASSETS.dummyProfile5,
    online: false,
  },
]

/** prototype 친구 수락 — 받은 친구 신청 더미 */
export const DUMMY_INCOMING_FRIEND_REQUESTS = [
  {
    id: "incoming-grave-robber",
    name: "Grave_Robber_X",
    profile: FRIEND_LIST_ASSETS.dummyProfile1,
    online: true,
  },
  {
    id: "incoming-venetian-rose",
    name: "Venetian_Rose",
    profile: FRIEND_LIST_ASSETS.dummyProfile2,
    online: true,
  },
  {
    id: "incoming-shadow-cloak",
    name: "Shadow_Cloak",
    profile: FRIEND_LIST_ASSETS.dummyProfile3,
    online: false,
  },
  {
    id: "incoming-court-jester",
    name: "Court_Jester",
    profile: FRIEND_LIST_ASSETS.dummyProfile4,
    online: true,
  },
]

/** 일반 폴더 더미 친구 (online: 접속 중 표시 여부) */
export const DUMMY_ONLINE_FRIENDS = [
  {
    id: "grave-robber",
    name: "Grave_Robber",
    profile: FRIEND_LIST_ASSETS.dummyProfile1,
    online: true,
  },
  {
    id: "venetian-rose-list",
    name: "Venetian_Rose",
    profile: FRIEND_LIST_ASSETS.dummyProfile2,
    online: false,
  },
  {
    id: "shadow-cloak-list",
    name: "Shadow_Cloak",
    profile: FRIEND_LIST_ASSETS.dummyProfile3,
    online: true,
  },
  {
    id: "court-jester-list",
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
    id: "masked-noble-offline",
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

/** friends 배열에서 online이 true인 항목 개수만 세어 반환 */
export function countOnlineFriends(friends) {
  return friends.filter((friend) => friend.online).length
}
