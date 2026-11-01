// 친구 초대 목록 한 줄: 프로필·이름·전적·초대 버튼
// FriendInviteModalContent가 씀, 전적 문구는 인게임 기록 목록과 같은 형식
import { formatPlayerRecordStats } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { MODAL_ASSETS } from "../../constants/friendInviteModalAssets.js"
import { MODAL_COPY } from "../../constants/friendInviteModalCopy.js"
import {
  INFO_CLASS,
  NAME_CLASS,
  NAME_ROW_CLASS,
  PROFILE_PHOTO_WRAP_CLASS,
  PROFILE_WRAP_CLASS,
  ROW_ACTION_BTN_CLASS,
  ROW_ACTION_BTN_IMG_CLASS,
  ROW_ACTION_BTN_LABEL_CLASS,
  FRIEND_INVITE_ROW_CLASS,
  ROW_INNER_CLASS,
  STATS_CLASS,
} from "../../constants/friendInviteModalLayout.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

// 친구 한 명 줄
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
  // 장착한 프로필 사진·테두리 id를 그림 경로로 바꿈
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId,
    accountProfileBorderId,
  })

  return (
    <li className={FRIEND_INVITE_ROW_CLASS} data-friend-id={id}>
      <div className={ROW_INNER_CLASS}>
        <PlayerProfilePortrait
          photoSrc={portraitSrc}
          frameSrc={frameSrc}
          wrapClassName={PROFILE_WRAP_CLASS}
          photoWrapClassName={PROFILE_PHOTO_WRAP_CLASS}
        />

        <div className={INFO_CLASS}>
          <div className={NAME_ROW_CLASS}>
            <p className={NAME_CLASS}>{name}</p>
            <p className={STATS_CLASS} data-testid={`friend-invite-stats-${id}`}>
              {formatPlayerRecordStats({
                totalGames: accountTotalGames,
                winRate: accountWinRate,
              })}
            </p>
          </div>
        </div>

        {/* 초대 버튼: 보내는 중이면 잠그고 취소 그림·"초대중.." 표시 */}
        <button
          type="button"
          aria-label={
            inviting
              ? MODAL_COPY.invitingFriendAria(name)
              : MODAL_COPY.inviteFriendAria(name)
          }
          disabled={inviting}
          data-sfx-kind={inviting ? undefined : "ui-confirm"}
          onClick={() => { if (!inviting) onInvite?.(id) }}
          className={ROW_ACTION_BTN_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={inviting ? MODAL_ASSETS.cancelButton : MODAL_ASSETS.inviteButton}
            alt=""
            className={ROW_ACTION_BTN_IMG_CLASS}
          />
          <span className={ROW_ACTION_BTN_LABEL_CLASS}>
            {inviting
              ? MODAL_COPY.invitingActionLabel
              : MODAL_COPY.inviteActionLabel}
          </span>
        </button>
      </div>
    </li>
  )
}
