// 펼침면 왼쪽 아래 칸 (내 직업 전적, 실패면 다시 시도, 아직이면 불러오는 중)
// InvitedGuestsSpread가 직업을 고를 때마다 새로 보이며 씀
import { motion } from "framer-motion"
import InvitedGuestsMyJobStats from "../../../../../domains/library/components/invitedGuests/left/InvitedGuestsMyJobStats.jsx"
import InvitedGuestsRetryMessage from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsRetryMessage.jsx"
import {
  INVITED_GUESTS_SPREAD_LEFT_LOWER_CELL_CLASS,
  INVITED_GUESTS_STATE_MESSAGE_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"
import {
  INVITED_GUESTS_REVEAL_ANIMATE,
  INVITED_GUESTS_REVEAL_DELAYS,
  INVITED_GUESTS_REVEAL_INITIAL,
  invitedGuestsRevealTransition,
} from "../../../../../domains/library/constants/invitedGuests/entranceMotion.js"

export default function InvitedGuestsStatsCell({ content, onRetry }) {
  return (
    <motion.div
      className={INVITED_GUESTS_SPREAD_LEFT_LOWER_CELL_CLASS}
      initial={INVITED_GUESTS_REVEAL_INITIAL}
      animate={INVITED_GUESTS_REVEAL_ANIMATE}
      transition={invitedGuestsRevealTransition(INVITED_GUESTS_REVEAL_DELAYS.leftLower)}
    >
      {content.statsStatus === "error" ? (
        <InvitedGuestsRetryMessage message={content.statsError ?? "전적을 불러오지 못했습니다."} onRetry={onRetry} />
      ) : content.myStats ? (
        <InvitedGuestsMyJobStats {...content.myStats} />
      ) : (
        <p className={INVITED_GUESTS_STATE_MESSAGE_CLASS}>전적을 불러오는 중입니다…</p>
      )}
    </motion.div>
  )
}
