import InvitedGuestsChallengeRewards from "@/domains/library/components/invitedGuests/shared/InvitedGuestsChallengeRewards.jsx"
import {
  INVITED_GUESTS_CHALLENGE_CLEARED_CELL_CLASS,
  INVITED_GUESTS_CHALLENGE_LABEL_CELL_CLASS,
  INVITED_GUESTS_CHALLENGE_REWARD_CELL_CLASS,
  INVITED_GUESTS_TABLE_ROW_CLASS,
} from "@/domains/library/constants/invitedGuests/tableStyle.js"

export default function InvitedGuestsChallengeRow({
  label,
  rewards,
  cleared = false,
  onOpenProfileBorderZoom,
}) {
  if (cleared) {
    return (
      <tr className={INVITED_GUESTS_TABLE_ROW_CLASS}>
        <td colSpan={2} className={INVITED_GUESTS_CHALLENGE_CLEARED_CELL_CLASS}>
          -- 도전과제 클리어 --
        </td>
      </tr>
    )
  }

  return (
    <tr className={INVITED_GUESTS_TABLE_ROW_CLASS}>
      <td className={INVITED_GUESTS_CHALLENGE_LABEL_CELL_CLASS}>{label}</td>
      <td className={INVITED_GUESTS_CHALLENGE_REWARD_CELL_CLASS}>
        <InvitedGuestsChallengeRewards rewards={rewards} onOpenProfileBorderZoom={onOpenProfileBorderZoom} />
      </td>
    </tr>
  )
}
