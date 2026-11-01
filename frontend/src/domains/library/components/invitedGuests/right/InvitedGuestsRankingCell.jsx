// 펼침면 오른쪽 위 랭킹 묶음 (제목 + 숙련도 랭킹, 실패·불러오는 중·빈 목록 안내)
// InvitedGuestsSpread가 직업 탭 아래에 씀
import { motion } from "framer-motion"
import InvitedGuestsMasteryRanking from "../../../../../domains/library/components/invitedGuests/right/InvitedGuestsMasteryRanking.jsx"
import InvitedGuestsRetryMessage from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsRetryMessage.jsx"
import InvitedGuestsSectionTitle from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import { STATE_MSG_CLASS } from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"
import {
  REVEAL_ANIMATE,
  REVEAL_DELAYS,
  REVEAL_INIT,
  revealTransition,
} from "../../../../../domains/library/constants/invitedGuests/entranceMotion.js"

// 제목·표를 따로 늦게 띄움, 직업 바뀌면 key로 다시 등장
export default function InvitedGuestsRankingCell({ jobIndex, content, onRetry }) {
  return (
    <>
      <motion.div
        key={`invited-right-title-${jobIndex}`}
        initial={REVEAL_INIT}
        animate={REVEAL_ANIMATE}
        transition={revealTransition(REVEAL_DELAYS.rightTitle)}
      >
        <InvitedGuestsSectionTitle>직업별 숙련도 랭킹</InvitedGuestsSectionTitle>
      </motion.div>
      <motion.div
        key={`invited-right-upper-${jobIndex}`}
        initial={REVEAL_INIT}
        animate={REVEAL_ANIMATE}
        transition={revealTransition(REVEAL_DELAYS.rightUpper)}
      >
        {/* 실패 → 다시 시도, 아직 안 옴 → 불러오는 중, 10판 이상 한 사람 없음 → 빈 목록 안내 */}
        {content.rankingStatus === "error" ? (
          <InvitedGuestsRetryMessage message={content.rankingError ?? "랭킹을 불러오지 못했습니다."} onRetry={onRetry} />
        ) : content.ranking === null ? (
          <p className={STATE_MSG_CLASS}>랭킹을 불러오는 중입니다…</p>
        ) : content.ranking.length === 0 ? (
          <p className={STATE_MSG_CLASS}>최소 10판 이상 플레이한 사용자가 아직 없습니다.</p>
        ) : (
          <InvitedGuestsMasteryRanking ranking={content.ranking} hideHeader />
        )}
      </motion.div>
    </>
  )
}
