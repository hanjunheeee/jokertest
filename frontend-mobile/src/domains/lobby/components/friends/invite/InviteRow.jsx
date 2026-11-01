// 받은 게임 초대 한 줄 (보낸 사람·끝난 이유·오류·거절/수락 버튼)
// InviteTab이 초대마다 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { describeState } from "@/domains/lobby/utils/gameInvite/inviteState.js"
import { DETAIL_ERROR_CLASS, DETAIL_MUTED_CLASS } from "../sheetStyle.js"
import RowShell from "../parts/RowShell.jsx"
import IconAction from "../parts/IconAction.jsx"

// 끝난 초대는 버튼 대신 이유 문구, 알림에서 찾던 초대는 테두리로 표시 (데스크톱 GameInviteRow와 같음)
export default function InviteRow({ invite, processing, error, targeted, onAccept, onDecline }) {
  const state = describeState(invite)
  const { inviteId } = invite

  const actions = state.actionable ? (
    <>
      <IconAction
        src={FRIEND_LIST_ASSETS.friendBlockButton}
        label="초대 거절"
        disabled={processing}
        data-decline-invite={inviteId}
        onClick={() => onDecline(inviteId)}
      />
      <IconAction
        src={FRIEND_LIST_ASSETS.friendAcceptButton}
        label={processing ? "초대 수락 처리 중" : "초대 수락"}
        disabled={processing}
        data-accept-invite={inviteId}
        onClick={() => onAccept(inviteId)}
      />
    </>
  ) : null

  return (
    <RowShell
      name={invite.senderName ?? "알 수 없는 사용자"}
      actions={actions}
      targeted={targeted}
      rowProps={{
        "data-invite-id": inviteId,
        "data-invite-status": invite.status,
        "data-notification-target": targeted ? "true" : undefined,
      }}
    >
      {state.actionable ? null : <p data-invite-ended="true" className={DETAIL_MUTED_CLASS}>{state.text}</p>}
      {error !== null && error !== undefined ? (
        <p role="status" data-invite-error={inviteId} className={DETAIL_ERROR_CLASS}>{error}</p>
      ) : null}
    </RowShell>
  )
}
