// 친구 초대 창 문구 (제목·버튼·읽기 프로그램용 이름)
// friendInvite 컴포넌트 셋(Shell·Content·Row)이 씀
export const MODAL_COPY = {
  title: "친구초대",
  inviteActionLabel: "초대하기",
  invitingActionLabel: "초대중..",
  closeAriaLabel: "친구 초대 닫기",
  listAriaLabel: "초대할 친구 목록",
  emptyFriends: "초대할 친구가 없습니다.",
  inviteFriendAria: (name) => `${name} 게임 초대`,
  invitingFriendAria: (name) => `${name} 초대 보내는 중`,
}
