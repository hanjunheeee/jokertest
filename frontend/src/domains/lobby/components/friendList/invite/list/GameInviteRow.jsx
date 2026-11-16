// 받은 게임 초대 한 줄 (보낸 사람·끝난 이유·오류·버튼)
// GameInviteList가 초대마다 그림
import {
  PROFILE_PORTRAIT_WRAP_CLASS,
  STATUS_DETAIL_ERROR_CLASS,
  STATUS_DETAIL_MUTED_CLASS,
  RECOMMENDED_INFO_WRAP_CLASS,
  RECOMMENDED_NAME_CLASS,
  RECOMMENDED_ROW_CLASS,
  ROW_FRAME_WRAP_CLASS,
  RECOMMENDED_ROW_CONTENT_CLASS,
  RECOMMENDED_ROW_FRAME_CLASS,
  RECOMMENDED_TEXT_WRAP_CLASS,
} from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import { describeState } from "../../../../utils/gameInvite/inviteState.js"
import PlayerProfilePortrait from "../../../../../../shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"
import GameInviteRowActions from "./GameInviteRowActions.jsx"

// 끝난 초대는 버튼 대신 이유 문구를 보임, 알림에서 찾던 초대는 표시함
export default function GameInviteRow({ invite, onAccept, onDecline, processing, error, targeted }) {
  const state = describeState(invite)
  const hasError = error !== null && error !== undefined

  return (
    <li
      className={RECOMMENDED_ROW_CLASS}
      data-invite-id={invite.inviteId}
      data-invite-status={invite.status}
      data-notification-target={targeted ? "true" : undefined}
      aria-current={targeted ? "true" : undefined}
    >
      <div className={ROW_FRAME_WRAP_CLASS}>
        <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={RECOMMENDED_ROW_FRAME_CLASS} />
        <div className={RECOMMENDED_ROW_CONTENT_CLASS}>
          <div className={RECOMMENDED_INFO_WRAP_CLASS}>
            <PlayerProfilePortrait wrapClassName={PROFILE_PORTRAIT_WRAP_CLASS} />
            <div className={RECOMMENDED_TEXT_WRAP_CLASS}>
              <p className={RECOMMENDED_NAME_CLASS}>
                {invite.senderName ?? "알 수 없는 사용자"}
              </p>
            </div>
          </div>
          {state.actionable ? (
            <GameInviteRowActions
              inviteId={invite.inviteId}
              onAccept={onAccept}
              onDecline={onDecline}
              processing={processing}
            />
          ) : null}
        </div>
      </div>
      {/* 실패·끝난 까닭 글은 줄 아래 한 줄 (줄 안 이름 칸은 좁아 글이 세로로 넘침), 실패 글이 있으면 그 글이 까닭이라 끝난 글은 안 겹침 */}
      {state.actionable || hasError ? null : (
        <p data-invite-ended="true" className={STATUS_DETAIL_MUTED_CLASS}>
          {state.text}
        </p>
      )}
      {hasError ? (
        <p role="status" data-invite-error={invite.inviteId} className={STATUS_DETAIL_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </li>
  )
}
