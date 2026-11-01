import InvitedGuestsRankingProfile from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsRankingProfile.jsx"
import InvitedGuestsStatValue from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsStatValue.jsx"
import {
  getRankCellClass,
  TABLE_NICKNAME_CELL_CLASS,
  TABLE_NUM_CELL_CLASS,
  TABLE_PROFILE_CELL_CLASS,
  TABLE_ROW_CLASS,
  TABLE_WINRATE_CELL_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"

export default function InvitedGuestsRankingRow({
  rank,
  profileSrc,
  profileBorderSrc,
  nickname,
  playCount,
  winRate,
}) {
  return (
    <tr className={TABLE_ROW_CLASS}>
      <td className={getRankCellClass(rank)}>{rank}</td>
      <td className={TABLE_PROFILE_CELL_CLASS}>
        <InvitedGuestsRankingProfile profileSrc={profileSrc} profileBorderSrc={profileBorderSrc} />
      </td>
      <td className={TABLE_NICKNAME_CELL_CLASS}>{nickname}</td>
      <td className={TABLE_NUM_CELL_CLASS}>
        <InvitedGuestsStatValue value={playCount} />
      </td>
      <td className={TABLE_WINRATE_CELL_CLASS}>
        <InvitedGuestsStatValue value={winRate} />
      </td>
    </tr>
  )
}