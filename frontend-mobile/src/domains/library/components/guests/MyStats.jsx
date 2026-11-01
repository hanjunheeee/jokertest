// 나의 직업 전적 (플레이 횟수·승률·생존 횟수, 실패면 다시 시도, 아직이면 불러오는 중)
// guests/JobIntroPage.jsx가 씀
import RetryMessage from "@m/domains/library/components/guests/RetryMessage.jsx"
import StatValue from "@m/domains/library/components/guests/StatValue.jsx"
import {
  INK_SOFT_CLASS,
  SECTION_TITLE_CLASS,
  SMALL_TEXT_CLASS,
  STATE_MSG_CLASS,
  TABLE_HEAD_ROW_CLASS,
} from "@m/domains/library/constants/libraryStyle.js"
import { TABLE_ROW_CLASS } from "@/domains/library/constants/invitedGuests/tableStyle.js"

// 상태 차례: 실패 → 다시 시도, 전적 있음 → 표, 그 밖 → 불러오는 중 (데스크톱과 같음)
export default function MyStats({ content, onRetry }) {
  const stats = content.myStats
  const rows = stats
    ? [
        { label: "플레이 횟수", value: stats.playCount },
        { label: "승률", value: stats.winRate },
        { label: "생존 횟수", value: stats.survivalCount },
      ]
    : []

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className={`m-0 ${SECTION_TITLE_CLASS}`}>나의 직업 전적</h3>
      {content.statsStatus === "error" ? (
        <RetryMessage message={content.statsError ?? "전적을 불러오지 못했습니다."} onRetry={onRetry} />
      ) : stats ? (
        <table className={`w-full border-collapse leading-snug ${SMALL_TEXT_CLASS}`}>
          <thead className={TABLE_HEAD_ROW_CLASS}>
            <tr>
              <th scope="col" className="pb-1.5 text-left">항목</th>
              <th scope="col" className="pb-1.5 text-right">기록</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, value }) => (
              <tr key={label} className={TABLE_ROW_CLASS}>
                <td className={`py-2 font-semibold ${INK_SOFT_CLASS}`}>{label}</td>
                <td className="py-2 text-right">
                  <StatValue value={value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={`m-0 ${STATE_MSG_CLASS}`}>전적을 불러오는 중입니다…</p>
      )}
    </section>
  )
}
