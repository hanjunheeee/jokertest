// 숙련도 랭킹 표 (순위·프로필·닉네임·판수·승률) + 5명씩 넘김
// guests/RankingSection.jsx가 씀, 순위 칸 모양은 데스크톱 tableStyle과 같은 값
import { useState } from "react"
import { INVITED_GUESTS_MASTERY_RANKING_LIMIT } from "@/shared/constants/jobSpreadMeta.js"
import {
  PROFILE_BORDER_CLASS,
  PROFILE_PHOTO_CLASS,
  rankCellClass,
} from "@m/domains/library/constants/guestsStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import StatValue from "@m/domains/library/components/guests/StatValue.jsx"
import {
  INK_BUTTON_CLASS,
  INK_SOFT_CLASS,
  SMALL_TEXT_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from "@m/domains/library/constants/libraryStyle.js"

// 한 줄: 사진 위에 테두리 겹침, 닉네임은 길면 말줄임
function RankingRow({ rank, profileSrc, profileBorderSrc, nickname, playCount, winRate }) {
  return (
    <tr className={TABLE_ROW_CLASS}>
      <td className={rankCellClass(rank)}>{rank}</td>
      <td className="w-11 py-1">
        <div className="relative mx-auto h-10 w-10">
          <PublicAsset src={profileSrc} alt="" className={PROFILE_PHOTO_CLASS} />
          {profileBorderSrc ? <PublicAsset src={profileBorderSrc} alt="" className={PROFILE_BORDER_CLASS} /> : null}
        </div>
      </td>
      <td className={`max-w-0 truncate pl-1.5 font-semibold ${INK_SOFT_CLASS}`}>{nickname}</td>
      <td className="w-10 text-right"><StatValue value={playCount} /></td>
      <td className="w-12 text-right"><StatValue value={winRate} /></td>
    </tr>
  )
}

// 쪽 수는 랭킹 길이로 계산, 지금 쪽이 범위 밖이면 끝 쪽으로 맞춤 (데스크톱과 같음)
export default function RankingTable({ ranking }) {
  const [page, setPage] = useState(0)
  const limit = INVITED_GUESTS_MASTERY_RANKING_LIMIT
  const pageCount = Math.max(1, Math.ceil(ranking.length / limit))
  const safePage = Math.min(page, pageCount - 1)
  const visible = ranking.slice(safePage * limit, (safePage + 1) * limit)

  return (
    <div>
      <table className={`w-full table-fixed border-collapse ${SMALL_TEXT_CLASS}`}>
        <thead className={TABLE_HEAD_ROW_CLASS}>
          <tr>
            <th scope="col" className="w-8 pb-1.5 text-center">순위</th>
            <th scope="col" className="w-11 pb-1.5 text-center">프로필</th>
            <th scope="col" className="pb-1.5 pl-1.5 text-left">닉네임</th>
            <th scope="col" className="w-10 pb-1.5 text-right">판수</th>
            <th scope="col" className="w-12 pb-1.5 text-right">승률</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => (
            <RankingRow key={entry.rank} {...entry} />
          ))}
        </tbody>
      </table>
      {pageCount > 1 ? (
        <div className={`mt-1 flex items-center justify-center gap-2 ${SMALL_TEXT_CLASS}`}>
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className={`${INK_BUTTON_CLASS}`}
            aria-label="이전 랭킹 페이지"
          >
            ◀
          </button>
          <span>{safePage + 1} / {pageCount}</span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            className={`${INK_BUTTON_CLASS}`}
            aria-label="다음 랭킹 페이지"
          >
            ▶
          </button>
        </div>
      ) : null}
    </div>
  )
}
