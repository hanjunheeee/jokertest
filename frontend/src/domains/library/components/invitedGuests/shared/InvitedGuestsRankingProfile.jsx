import PublicAsset from "../../../../../shared/ui/PublicAsset"
import {
  TABLE_PROFILE_BORDER_CLASS,
  TABLE_PROFILE_PHOTO_CLASS,
  TABLE_PROFILE_WRAP_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"

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