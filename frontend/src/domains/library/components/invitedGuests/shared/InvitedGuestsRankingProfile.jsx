// 랭킹 표 프로필 칸 (사진 위에 테두리 겹침)
// shared/InvitedGuestsRankingRow.jsx가 씀
import PublicAsset from "../../../../../shared/ui/PublicAsset"
import {
  TABLE_PROFILE_BORDER_CLASS,
  TABLE_PROFILE_PHOTO_CLASS,
  TABLE_PROFILE_WRAP_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"

// 테두리 없는 사람은 사진만
export default function InvitedGuestsRankingProfile({ profileSrc, profileBorderSrc }) {
  return (
    <div className={TABLE_PROFILE_WRAP_CLASS}>
      <PublicAsset src={profileSrc} alt="" className={TABLE_PROFILE_PHOTO_CLASS} />
      {profileBorderSrc ? (
        <PublicAsset src={profileBorderSrc} alt="" className={TABLE_PROFILE_BORDER_CLASS} />
      ) : null}
    </div>
  )
}