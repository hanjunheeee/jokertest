// 나의 직업 전적 표 (플레이 횟수·승률·생존 횟수)
// left/InvitedGuestsStatsCell.jsx가 씀
import InvitedGuestsSectionTitle from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import InvitedGuestsStatValue from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsStatValue.jsx"
import { STATS_SECTION_CLASS } from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"
import {
  STATS_HEAD_LABEL_CELL_CLASS,
  STATS_HEAD_VALUE_CELL_CLASS,
  STATS_LABEL_CELL_CLASS,
  STATS_TABLE_CLASS,
  STATS_VALUE_CELL_CLASS,
  INVITED_GUESTS_TABLE_BODY_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"

// 받은 세 값을 항목·기록 두 칸 표로 보임
export default function InvitedGuestsMyJobStats({ playCount, winRate, survivalCount }) {
  const rows = [
    { label: "플레이 횟수", value: playCount },
    { label: "승률", value: winRate },
    { label: "생존 횟수", value: survivalCount },
  ]

  return (
    <section className={STATS_SECTION_CLASS}>
      <InvitedGuestsSectionTitle>나의 직업 전적</InvitedGuestsSectionTitle>
      <table className={STATS_TABLE_CLASS}>
        <thead className={TABLE_HEAD_CLASS}>
          <tr>
            <th className={STATS_HEAD_LABEL_CELL_CLASS} scope="col">
              항목
            </th>
            <th className={STATS_HEAD_VALUE_CELL_CLASS} scope="col">
              기록
            </th>
          </tr>
        </thead>
        <tbody className={INVITED_GUESTS_TABLE_BODY_CLASS}>
          {rows.map(({ label, value }) => (
            <tr key={label} className={TABLE_ROW_CLASS}>
              <td className={STATS_LABEL_CELL_CLASS}>{label}</td>
              <td className={STATS_VALUE_CELL_CLASS}>
                <InvitedGuestsStatValue value={value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}