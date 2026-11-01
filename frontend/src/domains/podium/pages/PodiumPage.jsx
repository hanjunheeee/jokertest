import { motion } from "framer-motion"
import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { getPodiumTopThree } from "../utils/podiumRankingUtils.js"
import PodiumBackground from "../components/PodiumBackground.jsx"
import PodiumHeader from "../components/PodiumHeader.jsx"
import PodiumRankingTableShell from "../components/rankingTable/PodiumRankingTableShell.jsx"
import PodiumTopThree from "../components/topThree/PodiumTopThree.jsx"
import {
  BACK_BTN_REVEAL_DELAY,
  CONTENT_DROP_ANIMATE,
  CONTENT_DROP_INIT,
  CONTENT_DROP_TRANSITION,
  INNER_REVEAL_ANIMATE,
  INNER_REVEAL_DELAYS,
  INNER_REVEAL_INIT,
  INNER_REVEAL_TRANSITION,
} from "../constants/podiumEntranceMotion.js"
import { PODIUM_CONTENT_CLASS, PODIUM_PAGE_ROOT_CLASS } from "../constants/podiumLayoutStyle.js"
import { PODIUM_RANKING_DUMMY } from "../content/podiumRankingDummy.js"
import MotionBackButton from "../../../shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "../../../shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "../../../shared/constants/pageTransitions.js"

export default function PodiumPage() {
  const navigate = useNavigate()
  const topThree = useMemo(() => getPodiumTopThree(PODIUM_RANKING_DUMMY), [])

  return (
    <div className={PODIUM_PAGE_ROOT_CLASS}>
      <PodiumBackground />
      <motion.div
        className={PODIUM_CONTENT_CLASS}
        initial={CONTENT_DROP_INIT}
        animate={CONTENT_DROP_ANIMATE}
        transition={CONTENT_DROP_TRANSITION}
      >
        <motion.div
          initial={INNER_REVEAL_INIT}
          animate={INNER_REVEAL_ANIMATE}
          transition={{
            ...INNER_REVEAL_TRANSITION,
            delay: INNER_REVEAL_DELAYS.header,
          }}
        >
          <PodiumHeader />
        </motion.div>
        <motion.div
          initial={INNER_REVEAL_INIT}
          animate={INNER_REVEAL_ANIMATE}
          transition={{
            ...INNER_REVEAL_TRANSITION,
            delay: INNER_REVEAL_DELAYS.topThree,
          }}
        >
          <PodiumTopThree entries={topThree} />
        </motion.div>
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          initial={INNER_REVEAL_INIT}
          animate={INNER_REVEAL_ANIMATE}
          transition={{
            ...INNER_REVEAL_TRANSITION,
            delay: INNER_REVEAL_DELAYS.table,
          }}
        >
          <PodiumRankingTableShell ranking={PODIUM_RANKING_DUMMY} />
        </motion.div>
      </motion.div>
      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: BACK_BTN_REVEAL_DELAY }}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
      />
    </div>
  )
}
