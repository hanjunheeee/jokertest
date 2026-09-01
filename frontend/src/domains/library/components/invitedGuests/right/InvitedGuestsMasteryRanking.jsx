import InvitedGuestsRankingRow from "@/domains/library/components/invitedGuests/shared/InvitedGuestsRankingRow.jsx"
import InvitedGuestsSectionTitle from "@/domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import {
  INVITED_GUESTS_TABLE_CLASS,
  INVITED_GUESTS_TABLE_BODY_CLASS,
  INVITED_GUESTS_TABLE_HEAD_CELL_CLASS,
  INVITED_GUESTS_TABLE_HEAD_CLASS,
  INVITED_GUESTS_TABLE_HEAD_NUM_CELL_CLASS,
  INVITED_GUESTS_TABLE_HEAD_WINRATE_CELL_CLASS,
} from "@/domains/library/constants/invitedGuests/tableStyle.js"
import { INVITED_GUESTS_TABLE_SECTION_CLASS } from "@/domains/library/constants/invitedGuests/layoutStyle.js"

export default function InvitedGuestsMasteryRanking({ ranking, hideHeader = false }) {
  return (
    <section className={INVITED_GUESTS_TABLE_SECTION_CLASS}>
      {!hideHeader && <InvitedGuestsSectionTitle>직업별 숙련도 랭킹</InvitedGuestsSectionTitle>}
      <table className={INVITED_GUESTS_TABLE_CLASS}>
        <thead className={INVITED_GUESTS_TABLE_HEAD_CLASS}>
          <tr>
            <th className={INVITED_GUESTS_TABLE_HEAD_CELL_CLASS} scope="col">
              순위
            </th>
            <th className={INVITED_GUESTS_TABLE_HEAD_CELL_CLASS} scope="col">
              프로필
            </th>
            <th className={INVITED_GUESTS_TABLE_HEAD_CELL_CLASS} scope="col">
              닉네임
            </th>
            <th className={INVITED_GUESTS_TABLE_HEAD_NUM_CELL_CLASS} scope="col">
              판수
            </th>
            <th className={INVITED_GUESTS_TABLE_HEAD_WINRATE_CELL_CLASS} scope="col">
              승률
            </th>
          </tr>
        </thead>
        <tbody className={INVITED_GUESTS_TABLE_BODY_CLASS}>
          {ranking.map((entry) => (
            <InvitedGuestsRankingRow key={entry.rank} {...entry} />
          ))}
        </tbody>
      </table>
    </section>
  )
}
