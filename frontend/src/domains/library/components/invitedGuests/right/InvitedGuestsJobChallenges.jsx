import { useState } from "react"
import InvitedGuestsChallengeRow from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsChallengeRow.js"
import ProfileBorderZoomOverlay from "../../../../../shared/ui/profileBorderZoom/ProfileBorderZoomOverlay.jsx"
import {
  INVITED_GUESTS_TABLE_CLASS,
  INVITED_GUESTS_TABLE_BODY_CLASS,
  INVITED_GUESTS_TABLE_HEAD_CELL_CLASS,
  INVITED_GUESTS_TABLE_HEAD_CLASS,
  INVITED_GUESTS_TABLE_HEAD_REWARD_CELL_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"
import { INVITED_GUESTS_CHALLENGES_SECTION_CLASS } from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"

export default function InvitedGuestsJobChallenges({ challenges, targetAchievementId = null }) {
  const [profileBorderZoomItem, setProfileBorderZoomItem] = useState(null)

  return (
    <>
      <section className={INVITED_GUESTS_CHALLENGES_SECTION_CLASS}>
        <table className={INVITED_GUESTS_TABLE_CLASS}>
          <thead className={INVITED_GUESTS_TABLE_HEAD_CLASS}>
            <tr>
              <th className={INVITED_GUESTS_TABLE_HEAD_CELL_CLASS} scope="col">
                도전과제
              </th>
              <th className={INVITED_GUESTS_TABLE_HEAD_REWARD_CELL_CLASS} scope="col">
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
                // F-17(AC-02): 클리어·미클리어 **양쪽 행 모두**에 대상 표시를 전달한다 —
                // 방금 달성한 업적은 클리어 행으로 렌더되므로, 미클리어 행에만 붙이면
                // 정작 알림이 가리킨 행이 표시되지 않는다.
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