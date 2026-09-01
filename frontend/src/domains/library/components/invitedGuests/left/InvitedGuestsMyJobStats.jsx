import InvitedGuestsSectionTitle from "@/domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import InvitedGuestsStatValue from "@/domains/library/components/invitedGuests/shared/InvitedGuestsStatValue.jsx"
import { INVITED_GUESTS_STATS_SECTION_CLASS } from "@/domains/library/constants/invitedGuests/layoutStyle.js"
import {
  INVITED_GUESTS_STATS_HEAD_LABEL_CELL_CLASS,
  INVITED_GUESTS_STATS_HEAD_VALUE_CELL_CLASS,
  INVITED_GUESTS_STATS_LABEL_CELL_CLASS,
  INVITED_GUESTS_STATS_TABLE_CLASS,
  INVITED_GUESTS_STATS_VALUE_CELL_CLASS,
  INVITED_GUESTS_TABLE_BODY_CLASS,
  INVITED_GUESTS_TABLE_HEAD_CLASS,
  INVITED_GUESTS_TABLE_ROW_CLASS,
} from "@/domains/library/constants/invitedGuests/tableStyle.js"

export default function InvitedGuestsMyJobStats({ playCount, winRate, survivalCount }) {
  const rows = [
    { label: "플레이 횟수", value: playCount },
    { label: "승률", value: winRate },
    { label: "생존 횟수", value: survivalCount },
  ]

  return (
    <section className={INVITED_GUESTS_STATS_SECTION_CLASS}>
      <InvitedGuestsSectionTitle>나의 직업 전적</InvitedGuestsSectionTitle>
      <table className={INVITED_GUESTS_STATS_TABLE_CLASS}>
        <thead className={INVITED_GUESTS_TABLE_HEAD_CLASS}>
          <tr>
            <th className={INVITED_GUESTS_STATS_HEAD_LABEL_CELL_CLASS} scope="col">
              항목
            </th>
            <th className={INVITED_GUESTS_STATS_HEAD_VALUE_CELL_CLASS} scope="col">
              기록
            </th>
          </tr>
        </thead>
        <tbody className={INVITED_GUESTS_TABLE_BODY_CLASS}>
          {rows.map(({ label, value }) => (
            <tr key={label} className={INVITED_GUESTS_TABLE_ROW_CLASS}>
              <td className={INVITED_GUESTS_STATS_LABEL_CELL_CLASS}>{label}</td>
              <td className={INVITED_GUESTS_STATS_VALUE_CELL_CLASS}>
                <InvitedGuestsStatValue value={value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
