/**
 * 친구 초대 팝업 — 친구 한 줄 (전적 목록과 같은 닉네임·전적 + 행별 초대 버튼)
 */
import { formatPlayerRecordStats } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { FRIEND_INVITE_MODAL_ASSETS } from "../../constants/friendInviteModalAssets.js"
import { FRIEND_INVITE_MODAL_COPY } from "../../constants/friendInviteModalCopy.js"
import {
  FRIEND_INVITE_INFO_CLASS,
  FRIEND_INVITE_NAME_CLASS,
  FRIEND_INVITE_NAME_ROW_CLASS,
  FRIEND_INVITE_PROFILE_PHOTO_WRAP_CLASS,
  FRIEND_INVITE_PROFILE_WRAP_CLASS,
  FRIEND_INVITE_ROW_ACTION_BTN_CLASS,
  FRIEND_INVITE_ROW_ACTION_BTN_IMG_CLASS,
  FRIEND_INVITE_ROW_ACTION_BTN_LABEL_CLASS,
  FRIEND_INVITE_ROW_CLASS,
  FRIEND_INVITE_ROW_INNER_CLASS,
  FRIEND_INVITE_STATS_CLASS,
} from "../../constants/friendInviteModalLayout.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

export default function FriendInviteRow({
  id,
  name,
  accountProfilePhotoId,
  accountProfileBorderId,
  accountTotalGames,
  accountWinRate,
  inviting = false,
  onInvite,
}) {
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId,
    accountProfileBorderId,
  })

  return (
    <li className={FRIEND_INVITE_ROW_CLASS} data-friend-id={id}>
      <div className={FRIEND_INVITE_ROW_INNER_CLASS}>
        <PlayerProfilePortrait
          photoSrc={portraitSrc}
          frameSrc={frameSrc}
          wrapClassName={FRIEND_INVITE_PROFILE_WRAP_CLASS}
          photoWrapClassName={FRIEND_INVITE_PROFILE_PHOTO_WRAP_CLASS}
        />

        <div className={FRIEND_INVITE_INFO_CLASS}>
          <div className={FRIEND_INVITE_NAME_ROW_CLASS}>
            <p className={FRIEND_INVITE_NAME_CLASS}>{name}</p>
            <p className={FRIEND_INVITE_STATS_CLASS} data-testid={`friend-invite-stats-${id}`}>
              {formatPlayerRecordStats({
                totalGames: accountTotalGames,
                winRate: accountWinRate,
              })}
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label={
            inviting
              ? FRIEND_INVITE_MODAL_COPY.invitingFriendAria(name)
              : FRIEND_INVITE_MODAL_COPY.inviteFriendAria(name)
          }
          disabled={inviting}
          data-sfx-kind={inviting ? undefined : "ui-confirm"}
          onClick={() => { if (!inviting) onInvite?.(id) }}
          className={FRIEND_INVITE_ROW_ACTION_BTN_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={inviting ? FRIEND_INVITE_MODAL_ASSETS.cancelButton : FRIEND_INVITE_MODAL_ASSETS.inviteButton}
            alt=""
            className={FRIEND_INVITE_ROW_ACTION_BTN_IMG_CLASS}
          />
          <span className={FRIEND_INVITE_ROW_ACTION_BTN_LABEL_CLASS}>
            {inviting
              ? FRIEND_INVITE_MODAL_COPY.invitingActionLabel
              : FRIEND_INVITE_MODAL_COPY.inviteActionLabel}
          </span>
        </button>
      </div>
    </li>
  )
}
