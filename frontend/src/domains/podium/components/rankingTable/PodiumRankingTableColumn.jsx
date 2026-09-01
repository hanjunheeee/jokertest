import InvitedGuestsRankingRow from "@/domains/library/components/invitedGuests/shared/InvitedGuestsRankingRow.jsx"
import {
  INVITED_GUESTS_TABLE_BODY_CLASS,
  INVITED_GUESTS_TABLE_CLASS,
} from "@/domains/library/constants/invitedGuests/tableStyle.js"
import {
  PODIUM_TABLE_COLUMN_CLASS,
  PODIUM_TABLE_HEAD_CELL_CLASS,
  PODIUM_TABLE_HEAD_CLASS,
  PODIUM_TABLE_HEAD_NUM_CELL_CLASS,
  PODIUM_TABLE_HEAD_WINRATE_CELL_CLASS,
  PODIUM_TABLE_TBODY_OFFSET_CLASS,
} from "@/domains/podium/constants/podiumLayoutStyle.js"

/** 4~13위 — 좌/우 열 랭킹 테이블 (초대받은 자들과 동일 컬럼) */
export default function PodiumRankingTableColumn({ ranking }) {
  return (
    <div className={PODIUM_TABLE_COLUMN_CLASS}>
      <table className={INVITED_GUESTS_TABLE_CLASS}>
        <thead className={PODIUM_TABLE_HEAD_CLASS}>
          <tr>
            <th className={PODIUM_TABLE_HEAD_CELL_CLASS} scope="col">
              순위
            </th>
            <th className={PODIUM_TABLE_HEAD_CELL_CLASS} scope="col">
              프로필
            </th>
            <th className={PODIUM_TABLE_HEAD_CELL_CLASS} scope="col">
              닉네임
            </th>
            <th className={PODIUM_TABLE_HEAD_NUM_CELL_CLASS} scope="col">
              판수
            </th>
            <th className={PODIUM_TABLE_HEAD_WINRATE_CELL_CLASS} scope="col">
              승률
            </th>
          </tr>
        </thead>
        <tbody className={`${INVITED_GUESTS_TABLE_BODY_CLASS} ${PODIUM_TABLE_TBODY_OFFSET_CLASS}`}>
          {ranking.map((entry) => (
            <InvitedGuestsRankingRow key={entry.rank} {...entry} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
