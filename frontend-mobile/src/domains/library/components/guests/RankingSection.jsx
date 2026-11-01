// 직업별 숙련도 랭킹 칸 (제목 + 실패·불러오는 중·빈 목록 안내 또는 표)
// guests/InvitedGuestsView.jsx가 뒷면 위쪽에 씀
import RankingTable from "@m/domains/library/components/guests/RankingTable.jsx"
import RetryMessage from "@m/domains/library/components/guests/RetryMessage.jsx"
import { SECTION_TITLE_CLASS, STATE_MSG_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 실패 → 다시 시도, 아직 안 옴 → 불러오는 중, 10판 이상 한 사람 없음 → 빈 목록 안내 (데스크톱과 같은 문구)
export default function RankingSection({ content, onRetry }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className={`m-0 ${SECTION_TITLE_CLASS}`}>직업별 숙련도 랭킹</h3>
      {content.rankingStatus === "error" ? (
        <RetryMessage message={content.rankingError ?? "랭킹을 불러오지 못했습니다."} onRetry={onRetry} />
      ) : content.ranking === null ? (
        <p className={`m-0 ${STATE_MSG_CLASS}`}>랭킹을 불러오는 중입니다…</p>
      ) : content.ranking.length === 0 ? (
        <p className={`m-0 ${STATE_MSG_CLASS}`}>최소 10판 이상 플레이한 사용자가 아직 없습니다.</p>
      ) : (
        <RankingTable ranking={content.ranking} />
      )}
    </section>
  )
}
