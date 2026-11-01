// 알림에서 찾던 친구 신청이 목록에 없을 때 안내
// FriendAcceptTab이 대상 신청을 못 찾았을 때 그림
import { ACCEPT_EMPTY_CLASS } from "../../../../constants/friendListStyle.js"

// 이미 처리된 신청이라 빈 화면 대신 이유를 보임
export default function FriendAcceptTargetMissingNotice() {
  return (
    <p
      role="status"
      data-notification-target-missing="true"
      className={ACCEPT_EMPTY_CLASS}
    >
      알림에서 찾던 친구 요청은 이미 처리되었습니다.
    </p>
  )
}
