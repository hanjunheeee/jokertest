import InvitedGuestsRankingProfile from "@/domains/library/components/invitedGuests/shared/InvitedGuestsRankingProfile.jsx"
import InvitedGuestsStatValue from "@/domains/library/components/invitedGuests/shared/InvitedGuestsStatValue.jsx"
import {
  getInvitedGuestsRankCellClass,
  INVITED_GUESTS_TABLE_NICKNAME_CELL_CLASS,
  INVITED_GUESTS_TABLE_NUM_CELL_CLASS,
  INVITED_GUESTS_TABLE_PROFILE_CELL_CLASS,
  INVITED_GUESTS_TABLE_ROW_CLASS,
  INVITED_GUESTS_TABLE_WINRATE_CELL_CLASS,
} from "@/domains/library/constants/invitedGuests/tableStyle.js"

export default function InvitedGuestsRankingRow({
  rank,
  profileSrc,
  profileBorderSrc,
  nickname,
  playCount,
  winRate,
}) {
  return (
    <tr className={INVITED_GUESTS_TABLE_ROW_CLASS}>
      <td className={getInvitedGuestsRankCellClass(rank)}>{rank}</td>
      <td className={INVITED_GUESTS_TABLE_PROFILE_CELL_CLASS}>
        <InvitedGuestsRankingProfile profileSrc={profileSrc} profileBorderSrc={profileBorderSrc} />
      </td>
      <td className={INVITED_GUESTS_TABLE_NICKNAME_CELL_CLASS}>{nickname}</td>
      <td className={INVITED_GUESTS_TABLE_NUM_CELL_CLASS}>
        <InvitedGuestsStatValue value={playCount} />
      </td>
      <td className={INVITED_GUESTS_TABLE_WINRATE_CELL_CLASS}>
        <InvitedGuestsStatValue value={winRate} />
      </td>
    </tr>
  )
}
