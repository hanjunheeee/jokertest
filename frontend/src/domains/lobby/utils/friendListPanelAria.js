// 파일 역할: friendListPanelAria.js - 여러 곳에서 재사용하는 유틸 함수입니다.
// 현재 패널 화면에 맞는 dialog 이름을 정합니다.
export function getFriendPanelAriaLabel(view) {
  if (view === "request") return "친구 신청"
  if (view === "accept") return "친구 수락"
  return "친구 목록"
}
