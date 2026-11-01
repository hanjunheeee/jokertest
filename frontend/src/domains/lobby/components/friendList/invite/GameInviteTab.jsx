// 받은 게임 초대 탭 (새로고침·목록 오류·대상 없음 안내·초대 목록·뒤로)
// FriendListPanelContent가 invite 탭일 때 그림
import {
  ACCEPT_BACK_BTN_CLASS,
  ACCEPT_EMPTY_CLASS,
  FRIEND_ACCEPT_TAB_CLASS,
} from "../../../constants/friendListStyle.js"
import BackButton from "../../../../../shared/ui/BackButton.jsx"
import GameInviteToolbar from "./GameInviteToolbar.jsx"
import GameInviteTargetMissingNotice from "./GameInviteTargetMissingNotice.jsx"
import GameInviteList from "./list/GameInviteList.jsx"

// 바깥에서 쓰던 이름 그대로 다시 내보냄
export { ENDED_REASON_TEXT } from "../../../constants/gameInvite.js"
export { describeState as describeInviteState } from "../../../utils/gameInvite/inviteState.js"

// 대상 초대 없음 안내는 목록을 제대로 받았을 때만 보임
export default function GameInviteTab({
  onBack,
  invites = [],
  status = "idle",
  error = null,
  pendingInviteIds = new Set(),
  inviteErrors = {},
  onAccept,
  onDecline,
  onRefresh,
  targetInviteId = null,
}) {
  const loaded = status === "success"
  const targetMissing =
    loaded && error === null && targetInviteId !== null
    && !invites.some((invite) => invite.inviteId === targetInviteId)

  return (
    <div className={FRIEND_ACCEPT_TAB_CLASS}>
      <GameInviteToolbar onRefresh={onRefresh} />

      {error !== null ? (
        <p role="status" data-invite-list-error="true" className={ACCEPT_EMPTY_CLASS}>
          {error}
        </p>
      ) : null}
      {targetMissing ? <GameInviteTargetMissingNotice /> : null}

      <GameInviteList
        invites={invites}
        status={status}
        pendingInviteIds={pendingInviteIds}
        inviteErrors={inviteErrors}
        onAccept={onAccept}
        onDecline={onDecline}
        targetInviteId={targetInviteId}
      />

      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className={ACCEPT_BACK_BTN_CLASS}
      />
    </div>
  )
}
