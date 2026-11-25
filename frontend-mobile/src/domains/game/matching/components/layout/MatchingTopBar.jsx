// 대기방 위 줄: 파티 인원 (친구 초대·뒤로는 shell 하단)
// GameMatchingPage가 씀, 데스크톱 오른쪽 위 인원 머리말과 같음
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import {
  PARTY_COUNT_CLASS,
  PARTY_ICON_CLASS,
  PARTY_TEXT_CLASS,
} from "../../constants/matchingMobileStyles.js"

export default function MatchingTopBar({ visible, partyCount }) {
  return (
    <motion.header
      className="sticky top-0 z-20 flex h-14 items-center justify-center gap-2 px-3 land:h-12"
      initial={{ opacity: 0 }}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
      aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
    >
      <PublicAsset src={GAME_MATCHING_ASSETS.silhouetteNotReady} alt="" className={PARTY_ICON_CLASS} />
      <span className={PARTY_TEXT_CLASS}>
        {MATCHING_POPUP_COPY.partyLabel} <span className={PARTY_COUNT_CLASS}>{partyCount}</span>명
      </span>
    </motion.header>
  )
}
