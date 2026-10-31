import {
  FRIEND_ACCEPT_BACK_BUTTON_CLASS,
  FRIEND_ACCEPT_EMPTY_CLASS,
  FRIEND_ACCEPT_LIST_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS,
  FRIEND_ACCEPT_TAB_CLASS,
  FRIEND_ACCEPT_TOOLBAR_CLASS,
  FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS,
  FRIEND_LIST_STATUS_DETAIL_ERROR_CLASS,
  FRIEND_LIST_STATUS_DETAIL_MUTED_CLASS,
  RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS,
  RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS,
  RECOMMENDED_FRIEND_ACTIONS_CLASS,
  RECOMMENDED_FRIEND_INFO_WRAP_CLASS,
  RECOMMENDED_FRIEND_NAME_CLASS,
  RECOMMENDED_FRIEND_ROW_CLASS,
  RECOMMENDED_FRIEND_ROW_CONTENT_CLASS,
  RECOMMENDED_FRIEND_ROW_FRAME_CLASS,
  RECOMMENDED_FRIEND_TEXT_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import BackButton from "@/shared/ui/BackButton.jsx"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

export const INVITE_ENDED_REASON_TEXT = Object.freeze({
  DECLINED: "이미 거절한 초대입니다.",
  EXPIRED: "초대 시간이 지났습니다.",
  ACCEPTED: "이미 수락한 초대입니다.",
  CANCELLED: "더 이상 유효하지 않은 초대입니다.",
})

export function describeInviteState(invite, now = Date.now()) {
  if (invite === null || invite === undefined) return { actionable: false, text: "초대를 찾을 수 없습니다." }
  if (invite.status !== "PENDING") {
    return { actionable: false, text: INVITE_ENDED_REASON_TEXT[invite.status] ?? "처리된 초대입니다." }
  }
  const expiresAt = Date.parse(invite.expiresAt ?? "")
  if (Number.isFinite(expiresAt) && expiresAt <= now) {
    return { actionable: false, text: INVITE_ENDED_REASON_TEXT.EXPIRED }
  }
  return { actionable: true, text: null }
}

function GameInviteRow({ invite, onAccept, onDecline, processing, error, targeted }) {
  const state = describeInviteState(invite)

  return (
    <li
      className={RECOMMENDED_FRIEND_ROW_CLASS}
      data-invite-id={invite.inviteId}
      data-invite-status={invite.status}
      data-notification-target={targeted ? "true" : undefined}
      aria-current={targeted ? "true" : undefined}
    >
      <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={RECOMMENDED_FRIEND_ROW_FRAME_CLASS} />
      <div className={RECOMMENDED_FRIEND_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_FRIEND_INFO_WRAP_CLASS}>
          <PlayerProfilePortrait wrapClassName={FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS} />
          <div className={RECOMMENDED_FRIEND_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_FRIEND_NAME_CLASS}>
              {invite.senderName ?? "알 수 없는 사용자"}
            </p>
            {state.actionable ? null : (
              <p data-invite-ended="true" className={FRIEND_LIST_STATUS_DETAIL_MUTED_CLASS}>
                {state.text}
              </p>
            )}
            {error !== null && error !== undefined ? (
              <p role="status" data-invite-error={invite.inviteId} className={FRIEND_LIST_STATUS_DETAIL_ERROR_CLASS}>
                {error}
              </p>
            ) : null}
          </div>
        </div>
        {state.actionable ? (
          <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
            <button
              type="button"
              className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
              aria-label="초대 거절"
              aria-disabled={processing}
              disabled={processing}
              data-decline-invite={invite.inviteId}
              onClick={() => { if (!processing) onDecline(invite.inviteId) }}
              style={{ outline: "none" }}
            >
              <PublicAsset src={FRIEND_LIST_ASSETS.friendBlockButton} alt="" className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS} />
            </button>
            <button
              type="button"
              className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
              aria-label={processing ? "초대 수락 처리 중" : "초대 수락"}
              aria-disabled={processing}
              disabled={processing}
              data-accept-invite={invite.inviteId}
              onClick={() => { if (!processing) onAccept(invite.inviteId) }}
              style={{ outline: "none" }}
            >
              <PublicAsset src={FRIEND_LIST_ASSETS.friendAcceptButton} alt="" className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS} />
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function GameInviteTargetMissingNotice() {
  return (
    <p role="status" data-invite-target-missing="true" className={FRIEND_ACCEPT_EMPTY_CLASS}>
      알림에서 찾던 초대는 더 이상 유효하지 않습니다.
    </p>
  )
}

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
      <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="게임 초대 목록 새로고침"
          className={FRIEND_ACCEPT_REFRESH_BUTTON_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset src={FRIEND_LIST_ASSETS.refreshButton} alt="" className={FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS} />
        </button>
      </div>

      {error !== null ? (
        <p role="status" data-invite-list-error="true" className={FRIEND_ACCEPT_EMPTY_CLASS}>
          {error}
        </p>
      ) : null}
      {targetMissing ? <GameInviteTargetMissingNotice /> : null}

      <ul className={FRIEND_ACCEPT_LIST_CLASS} aria-label="받은 게임 초대">
        {invites.length === 0 ? (
          <li className={FRIEND_ACCEPT_EMPTY_CLASS}>
            {status === "loading" ? "초대를 불러오는 중입니다." : "받은 게임 초대가 없습니다."}
          </li>
        ) : (
          invites.map((invite) => (
            <GameInviteRow
              key={invite.inviteId}
              invite={invite}
              onAccept={onAccept}
              onDecline={onDecline}
              processing={pendingInviteIds.has(invite.inviteId)}
              error={inviteErrors[invite.inviteId] ?? null}
              targeted={targetInviteId !== null && invite.inviteId === targetInviteId}
            />
          ))
        )}
      </ul>

      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className={FRIEND_ACCEPT_BACK_BUTTON_CLASS}
      />
    </div>
  )
}
