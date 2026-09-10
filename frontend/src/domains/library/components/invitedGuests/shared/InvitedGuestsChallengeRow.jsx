import InvitedGuestsChallengeRewards from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsChallengeRewards.jsx"
import {
  INVITED_GUESTS_CHALLENGE_CLEARED_CELL_CLASS,
  INVITED_GUESTS_CHALLENGE_LABEL_CELL_CLASS,
  INVITED_GUESTS_CHALLENGE_REWARD_CELL_CLASS,
  INVITED_GUESTS_TABLE_ROW_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"

export default function InvitedGuestsChallengeRow({
  label,
  rewards,
  cleared = false,
  current = null,
  threshold = null,
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

  // F-12 AC-01: 서버 진행률(current/threshold)이 있으면 label 옆에 함께 보여준다 —
  // roleStatistics.store.js/mergeInvitedGuestsSpreads.js가 더 이상 cleared 불리언만
  // 남기고 버리지 않는다(CODEX-1 재검토).
  const hasProgress = typeof current === "number" && typeof threshold === "number"

  return (
    <tr className={INVITED_GUESTS_TABLE_ROW_CLASS}>
      <td className={INVITED_GUESTS_CHALLENGE_LABEL_CELL_CLASS}>
        {label}
        {hasProgress ? ` (${Math.min(current, threshold)}/${threshold})` : null}
      </td>
      <td className={INVITED_GUESTS_CHALLENGE_REWARD_CELL_CLASS}>
        <InvitedGuestsChallengeRewards rewards={rewards} onOpenProfileBorderZoom={onOpenProfileBorderZoom} />
      </td>
    </tr>
  )
}