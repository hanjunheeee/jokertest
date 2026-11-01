// 알림에서 찾던 게임 초대가 목록에 없을 때 안내
// GameInviteTab이 대상 초대를 못 찾았을 때 그림
import { FRIEND_ACCEPT_EMPTY_CLASS } from "../../../constants/friendListStyle.js"

// 이미 끝난 초대라 빈 화면 대신 이유를 보임
export default function GameInviteTargetMissingNotice() {
  return (
    <p role="status" data-invite-target-missing="true" className={FRIEND_ACCEPT_EMPTY_CLASS}>
      알림에서 찾던 초대는 더 이상 유효하지 않습니다.
    </p>
  )
}
