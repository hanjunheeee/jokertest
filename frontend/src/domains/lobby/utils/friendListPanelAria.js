// 파일 역할: friendListPanelAria.js - 여러 곳에서 재사용하는 유틸 함수입니다.
// 현재 패널 화면에 맞는 dialog 이름을 정합니다.
export function getFriendPanelAriaLabel(view) {
  if (view === "request") return "친구 신청"
  if (view === "accept") return "친구 수락"
  // F-19: 초대·차단 화면도 같은 패널 안의 화면이라 dialog 이름을 함께 바꾼다.
  if (view === "invite") return "게임 초대"
  if (view === "block") return "차단 목록"
  return "친구 목록"
}
