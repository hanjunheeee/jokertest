// 친구 초대 목록 한 줄: 프로필·이름·전적·초대 버튼
// FriendInviteSheet가 씀, 문구·그림·전적 형식·글자색은 데스크톱 FriendInviteRow와 같음
import { formatPlayerRecordStats } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { MODAL_ASSETS } from "@/domains/game/matching/constants/friendInviteModalAssets.js"
import { MODAL_COPY } from "@/domains/game/matching/constants/friendInviteModalCopy.js"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"
import ProfilePortrait from "@m/shared/ui/portrait/ProfilePortrait.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { FRIEND_ROW_CLASS, ROW_BUTTON_LOOK } from "../../constants/voteFrameStyle.js"

// 친구 한 명 줄 (초대 중이면 잠그고 취소 그림·"초대중..")
export default function FriendInviteRow({ friend, inviting, onInvite }) {
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: friend.accountProfilePhotoId,
    accountProfileBorderId: friend.accountProfileBorderId,
  })

  return (
    <li className={FRIEND_ROW_CLASS} data-friend-id={friend.id}>
      <ProfilePortrait photoSrc={portraitSrc} frameSrc={frameSrc} spot="raised" className="size-[3.2rem]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="min-w-0 truncate font-display app-text-scaled [--app-text-size:0.95rem] font-medium leading-tight text-white antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
          {friend.name}
        </p>
        <p
          className="min-w-0 truncate font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold leading-none text-white/55 tabular-nums"
          data-testid={`friend-invite-stats-${friend.id}`}
        >
          {formatPlayerRecordStats({ totalGames: friend.accountTotalGames, winRate: friend.accountWinRate })}
        </p>
      </div>
      <ImageButton
        look={ROW_BUTTON_LOOK}
        label={inviting ? MODAL_COPY.invitingActionLabel : MODAL_COPY.inviteActionLabel}
        ariaLabel={inviting ? MODAL_COPY.invitingFriendAria(friend.name) : MODAL_COPY.inviteFriendAria(friend.name)}
        src={inviting ? MODAL_ASSETS.cancelButton : MODAL_ASSETS.inviteButton}
        disabled={inviting}
        sfxKind={inviting ? undefined : "ui-confirm"}
        onClick={() => { if (!inviting) onInvite?.(friend.id) }}
      />
    </li>
  )
}
