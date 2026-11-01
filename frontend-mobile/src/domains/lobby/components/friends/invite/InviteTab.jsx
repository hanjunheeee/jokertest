// 게임 초대 탭 (새로고침·목록 오류·대상 없음 안내·불러오는 중·초대 목록)
// SheetBody가 invite 탭일 때 그림
import { LIST_CLASS, TOOLBAR_CLASS } from "../sheetStyle.js"
import Notice from "../parts/Notice.jsx"
import RefreshButton from "../parts/RefreshButton.jsx"
import InviteRow from "./InviteRow.jsx"

// 값·처리 함수는 데스크톱 usePanelInvites의 inviteList 묶음 그대로, 대상 없음 안내는 목록을 제대로 받았을 때만
export default function InviteTab({ inviteList, targetInviteId }) {
  const { invites, status, error, pendingInviteIds, inviteErrors, onAccept, onDecline, onRefresh } = inviteList
  const targetMissing = status === "success" && error === null && targetInviteId !== null
    && !invites.some((invite) => invite.inviteId === targetInviteId)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={TOOLBAR_CLASS}>
        <RefreshButton label="게임 초대 목록 새로고침" onClick={onRefresh} />
      </div>
      <div className={LIST_CLASS}>
        {error !== null ? <Notice tone="error" data-invite-list-error="true">{error}</Notice> : null}
        {targetMissing ? (
          <Notice data-invite-target-missing="true">알림에서 찾던 초대는 더 이상 유효하지 않습니다.</Notice>
        ) : null}
        {invites.length === 0 ? (
          <Notice>{status === "loading" ? "초대를 불러오는 중입니다." : "받은 게임 초대가 없습니다."}</Notice>
        ) : (
          <ul aria-label="받은 게임 초대">
            {invites.map((invite) => (
              <InviteRow
                key={invite.inviteId}
                invite={invite}
                processing={pendingInviteIds.has(invite.inviteId)}
                error={inviteErrors[invite.inviteId] ?? null}
                targeted={targetInviteId !== null && invite.inviteId === targetInviteId}
                onAccept={onAccept}
                onDecline={onDecline}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
