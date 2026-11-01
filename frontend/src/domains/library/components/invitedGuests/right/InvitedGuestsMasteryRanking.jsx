import { useState } from "react"
import InvitedGuestsRankingRow from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsRankingRow.jsx"
import InvitedGuestsSectionTitle from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import {
  INVITED_GUESTS_TABLE_CLASS,
  INVITED_GUESTS_TABLE_BODY_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_HEAD_NUM_CELL_CLASS,
  TABLE_HEAD_WINRATE_CELL_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"
import { TABLE_SECTION_CLASS } from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"
import { INVITED_GUESTS_MASTERY_RANKING_LIMIT } from "../../../../../shared/constants/jobSpreadMeta.js"

export default function InvitedGuestsMasteryRanking({ ranking, hideHeader = false }) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(ranking.length / INVITED_GUESTS_MASTERY_RANKING_LIMIT))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRanking = ranking.slice(
    safePage * INVITED_GUESTS_MASTERY_RANKING_LIMIT,
    (safePage + 1) * INVITED_GUESTS_MASTERY_RANKING_LIMIT,
  )

  return (
    <section className={TABLE_SECTION_CLASS}>
      {!hideHeader && <InvitedGuestsSectionTitle>직업별 숙련도 랭킹</InvitedGuestsSectionTitle>}
      <table className={INVITED_GUESTS_TABLE_CLASS}>
        <thead className={TABLE_HEAD_CLASS}>
          <tr>
            <th className={TABLE_HEAD_CELL_CLASS} scope="col">
              순위
            </th>
            <th className={TABLE_HEAD_CELL_CLASS} scope="col">
              프로필
            </th>
            <th className={TABLE_HEAD_CELL_CLASS} scope="col">
              닉네임
            </th>
            <th className={TABLE_HEAD_NUM_CELL_CLASS} scope="col">
              판수
            </th>
            <th className={TABLE_HEAD_WINRATE_CELL_CLASS} scope="col">
              승률
            </th>
          </tr>
        </thead>
        <tbody className={INVITED_GUESTS_TABLE_BODY_CLASS}>
          {visibleRanking.map((entry) => (
            <InvitedGuestsRankingRow key={entry.rank} {...entry} />
          ))}
        </tbody>
      </table>
      {pageCount > 1 && (
        <div className="mt-1 flex items-center justify-center gap-3 font-subheading app-text-scaled [--app-text-size:0.78rem] text-[#1a1008]">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="disabled:opacity-30"
            aria-label="이전 랭킹 페이지"
          >
            ◀
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            className="disabled:opacity-30"
            aria-label="다음 랭킹 페이지"
          >
            ▶
          </button>
        </div>
      )}
    </section>
  )
}
