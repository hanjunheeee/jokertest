import PublicAsset from "@/shared/ui/PublicAsset"
import {
  INVITED_GUESTS_TABLE_PROFILE_BORDER_CLASS,
  INVITED_GUESTS_TABLE_PROFILE_PHOTO_CLASS,
  INVITED_GUESTS_TABLE_PROFILE_WRAP_CLASS,
} from "@/domains/library/constants/invitedGuests/tableStyle.js"

export default function InvitedGuestsRankingProfile({ profileSrc, profileBorderSrc }) {
  return (
    <div className={INVITED_GUESTS_TABLE_PROFILE_WRAP_CLASS}>
      <PublicAsset src={profileSrc} alt="" className={INVITED_GUESTS_TABLE_PROFILE_PHOTO_CLASS} />
      {profileBorderSrc ? (
        <PublicAsset src={profileBorderSrc} alt="" className={INVITED_GUESTS_TABLE_PROFILE_BORDER_CLASS} />
      ) : null}
    </div>
  )
}
