// 게임 초대 탭 (새로고침·목록 오류·대상 없음 안내·초대 목록 또는 불러오는 중·없음·뒤로)
// SheetBody가 invite 탭일 때 그림
import { ACCEPT_EMPTY_CLASS, ACCEPT_TOOLBAR_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import { SCROLL_CLASS } from "../sheetStyle.js"
import RefreshButton from "../parts/RefreshButton.jsx"
import BackRow from "../parts/BackRow.jsx"
import InviteRow from "./InviteRow.jsx"

// 값·처리 함수는 데스크톱 usePanelInvites의 inviteList 묶음 그대로, 순서·문구는 데스크톱 GameInviteTab과 같음
export default function InviteTab({ onBack, inviteList, targetInviteId }) {
  const { invites, status, error, pendingInviteIds, inviteErrors, onAccept, onDecline, onRefresh } = inviteList
  const targetMissing = status === "success" && error === null && targetInviteId !== null
    && !invites.some((invite) => invite.inviteId === targetInviteId)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`${ACCEPT_TOOLBAR_CLASS} !mt-0 !pr-0`}>
        <RefreshButton label="게임 초대 목록 새로고침" onClick={onRefresh} />
      </div>
      <div className={SCROLL_CLASS}>
        {error !== null ? (
          <p role="status" data-invite-list-error="true" className={ACCEPT_EMPTY_CLASS}>{error}</p>
        ) : null}
        {targetMissing ? (
          <p role="status" data-invite-target-missing="true" className={ACCEPT_EMPTY_CLASS}>
            알림에서 찾던 초대는 더 이상 유효하지 않습니다.
          </p>
        ) : null}
        <ul className="mt-2" aria-label="받은 게임 초대">
          {invites.length === 0 ? (
            <li className={ACCEPT_EMPTY_CLASS}>
              {status === "loading" ? "초대를 불러오는 중입니다." : "받은 게임 초대가 없습니다."}
            </li>
          ) : (
            invites.map((invite) => (
              <InviteRow
                key={invite.inviteId}
                invite={invite}
                processing={pendingInviteIds.has(invite.inviteId)}
                error={inviteErrors[invite.inviteId] ?? null}
                targeted={targetInviteId !== null && invite.inviteId === targetInviteId}
                onAccept={onAccept}
                onDecline={onDecline}
              />
            ))
          )}
        </ul>
      </div>
      <BackRow onBack={onBack} />
    </div>
  )
}
