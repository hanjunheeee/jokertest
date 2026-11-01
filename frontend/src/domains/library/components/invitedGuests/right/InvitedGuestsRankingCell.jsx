// 펼침면 오른쪽 위 랭킹 묶음 (제목 + 숙련도 랭킹, 실패·불러오는 중·빈 목록 안내)
// InvitedGuestsSpread가 직업 탭 아래에 씀
import { motion } from "framer-motion"
import InvitedGuestsMasteryRanking from "../../../../../domains/library/components/invitedGuests/right/InvitedGuestsMasteryRanking.jsx"
import InvitedGuestsRetryMessage from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsRetryMessage.jsx"
import InvitedGuestsSectionTitle from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import { INVITED_GUESTS_STATE_MESSAGE_CLASS } from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"
import {
  INVITED_GUESTS_REVEAL_ANIMATE,
  INVITED_GUESTS_REVEAL_DELAYS,
  INVITED_GUESTS_REVEAL_INITIAL,
  invitedGuestsRevealTransition,
} from "../../../../../domains/library/constants/invitedGuests/entranceMotion.js"

// 10판 넘게 한 사람이 없으면 빈 목록 안내를 보임
export default function InvitedGuestsRankingCell({ jobIndex, content, onRetry }) {
  return (
    <>
      <motion.div
        key={`invited-right-title-${jobIndex}`}
        initial={INVITED_GUESTS_REVEAL_INITIAL}
        animate={INVITED_GUESTS_REVEAL_ANIMATE}
        transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.rightTitle)}
      >
        <InvitedGuestsSectionTitle>직업별 숙련도 랭킹</InvitedGuestsSectionTitle>
      </motion.div>
      <motion.div
        key={`invited-right-upper-${jobIndex}`}
        initial={INVITED_GUESTS_REVEAL_INITIAL}
        animate={INVITED_GUESTS_REVEAL_ANIMATE}
        transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.rightUpper)}
      >
        {content.rankingStatus === "error" ? (
          <InvitedGuestsRetryMessage message={content.rankingError ?? "랭킹을 불러오지 못했습니다."} onRetry={onRetry} />
        ) : content.ranking === null ? (
          <p className={INVITED_GUESTS_STATE_MESSAGE_CLASS}>랭킹을 불러오는 중입니다…</p>
        ) : content.ranking.length === 0 ? (
          <p className={INVITED_GUESTS_STATE_MESSAGE_CLASS}>최소 10판 이상 플레이한 사용자가 아직 없습니다.</p>
        ) : (
          <InvitedGuestsMasteryRanking ranking={content.ranking} hideHeader />
        )}
      </motion.div>
    </>
  )
}
