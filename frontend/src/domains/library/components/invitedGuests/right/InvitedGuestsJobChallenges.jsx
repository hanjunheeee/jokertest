import { useState } from "react"
import InvitedGuestsChallengeRow from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsChallengeRow.js"
import ProfileBorderZoomOverlay from "../../../../../shared/ui/profileBorderZoom/ProfileBorderZoomOverlay.jsx"
import {
  INVITED_GUESTS_TABLE_CLASS,
  INVITED_GUESTS_TABLE_BODY_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_HEAD_REWARD_CELL_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"
import { CHALLENGES_SECTION_CLASS } from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"

export default function InvitedGuestsJobChallenges({ challenges, targetAchievementId = null }) {
  const [profileBorderZoomItem, setProfileBorderZoomItem] = useState(null)

  return (
    <>
      <section className={CHALLENGES_SECTION_CLASS}>
        <table className={INVITED_GUESTS_TABLE_CLASS}>
          <thead className={TABLE_HEAD_CLASS}>
            <tr>
              <th className={TABLE_HEAD_CELL_CLASS} scope="col">
                도전과제
              </th>
              <th className={TABLE_HEAD_REWARD_CELL_CLASS} scope="col">
                보상
              </th>
            </tr>
          </thead>
          <tbody className={INVITED_GUESTS_TABLE_BODY_CLASS}>
            {challenges.map((challenge) => (
              <InvitedGuestsChallengeRow
                key={challenge.id}
                achievementId={challenge.id}
                label={challenge.label}
                rewards={challenge.rewards}
                cleared={challenge.cleared}
                current={challenge.current}
                threshold={challenge.threshold}
                targeted={targetAchievementId !== null && challenge.id === targetAchievementId}
                onOpenProfileBorderZoom={setProfileBorderZoomItem}
              />
            ))}
          </tbody>
        </table>
      </section>

      <ProfileBorderZoomOverlay
        open={Boolean(profileBorderZoomItem)}
        item={profileBorderZoomItem}
        onClose={() => setProfileBorderZoomItem(null)}
      />
    </>
  )
}