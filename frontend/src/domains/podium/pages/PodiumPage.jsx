import { motion } from "framer-motion"
import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { getPodiumTopThree } from "@/domains/podium/utils/podiumRankingUtils.js"
import PodiumBackground from "@/domains/podium/components/PodiumBackground.jsx"
import PodiumHeader from "@/domains/podium/components/PodiumHeader.jsx"
import PodiumRankingTableShell from "@/domains/podium/components/rankingTable/PodiumRankingTableShell.jsx"
import PodiumTopThree from "@/domains/podium/components/topThree/PodiumTopThree.jsx"
import {
  PODIUM_BACK_BUTTON_REVEAL_DELAY,
  PODIUM_CONTENT_DROP_ANIMATE,
  PODIUM_CONTENT_DROP_INITIAL,
  PODIUM_CONTENT_DROP_TRANSITION,
  PODIUM_INNER_REVEAL_ANIMATE,
  PODIUM_INNER_REVEAL_DELAYS,
  PODIUM_INNER_REVEAL_INITIAL,
  PODIUM_INNER_REVEAL_TRANSITION,
} from "@/domains/podium/constants/podiumEntranceMotion.js"
import { PODIUM_CONTENT_CLASS, PODIUM_PAGE_ROOT_CLASS } from "@/domains/podium/constants/podiumLayoutStyle.js"
import { PODIUM_RANKING_DUMMY } from "@/domains/podium/content/podiumRankingDummy.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

/** 로비 — 명예의 전당 */
export default function PodiumPage() {
  const navigate = useNavigate()
  const topThree = useMemo(() => getPodiumTopThree(PODIUM_RANKING_DUMMY), [])

  return (
    <div className={PODIUM_PAGE_ROOT_CLASS}>
      <PodiumBackground />
      <motion.div
        className={PODIUM_CONTENT_CLASS}
        initial={PODIUM_CONTENT_DROP_INITIAL}
        animate={PODIUM_CONTENT_DROP_ANIMATE}
        transition={PODIUM_CONTENT_DROP_TRANSITION}
      >
        <motion.div
          initial={PODIUM_INNER_REVEAL_INITIAL}
          animate={PODIUM_INNER_REVEAL_ANIMATE}
          transition={{
            ...PODIUM_INNER_REVEAL_TRANSITION,
            delay: PODIUM_INNER_REVEAL_DELAYS.header,
          }}
        >
          <PodiumHeader />
        </motion.div>
        <motion.div
          initial={PODIUM_INNER_REVEAL_INITIAL}
          animate={PODIUM_INNER_REVEAL_ANIMATE}
          transition={{
            ...PODIUM_INNER_REVEAL_TRANSITION,
            delay: PODIUM_INNER_REVEAL_DELAYS.topThree,
          }}
        >
          <PodiumTopThree entries={topThree} />
        </motion.div>
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          initial={PODIUM_INNER_REVEAL_INITIAL}
          animate={PODIUM_INNER_REVEAL_ANIMATE}
          transition={{
            ...PODIUM_INNER_REVEAL_TRANSITION,
            delay: PODIUM_INNER_REVEAL_DELAYS.table,
          }}
        >
          <PodiumRankingTableShell ranking={PODIUM_RANKING_DUMMY} />
        </motion.div>
      </motion.div>
      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: PODIUM_BACK_BUTTON_REVEAL_DELAY }}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
      />
    </div>
  )
}
