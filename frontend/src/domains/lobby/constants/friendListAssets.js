// 파일 역할: friendListAssets.js - 화면과 로직에서 재사용하는 상수입니다.
// 로비 친구 목록 패널에서 사용하는 public 에셋 경로입니다.
export const FRIEND_LIST_ASSETS = {
  openButton: "/button/친구목록 버튼.png".normalize("NFD"),
  panelFrame: "/frame/friendList/친구목록 탭 프레임.png",
  rowFrame: "/frame/friendList/찢어진 비단 프레임.png".normalize("NFD"),
  recommendedTag: "/frame/friendList/추천친구 태그.png",
  refreshButton: "/button/새로고침 버튼.png",
  onlineBadge: "/frame/friendList/접속중 표시.png".normalize("NFD"),
  searchInput: "/button/friendList/검색 입력창.png".normalize("NFD"),
  sectionPlate: "/button/입력창1.png",
  folderClosed: "/button/friendList/닫힌 폴더.png".normalize("NFD"),
  folderOpen: "/button/friendList/열린폴더.png".normalize("NFD"),
  chevronUp: "/button/friendList/upper꺽쇠.png".normalize("NFD"),
  chevronDown: "/button/friendList/lower꺽쇠.png".normalize("NFD"),
  friendBlockButton: "/button/friendList/친구차단버튼.png",
  // F-19(AC-04): 요청 "거절"과 "차단"은 대상도 결과도 다른 작업이라 같은 그림을 쓰면
  // 화면만 보고 구분할 수 없다. 거절은 기존 취소/부정 버튼 자산을 쓴다.
  friendDeclineButton: "/button/버튼(취소 및 부정).png".normalize("NFD"),
  friendRequestButton: "/button/friendList/친구신청버튼_개선.png",
  friendAcceptButton: "/button/friendList/친구수락버튼_개선.png",
  acceptAllButton: "/button/버튼(수락 및 긍정).png".normalize("NFD"),
  tabButtonInactive: "/button/버튼(미선택).png",
  tabButtonActive: "/button/버튼(수락 및 긍정).png".normalize("NFD"),
}
