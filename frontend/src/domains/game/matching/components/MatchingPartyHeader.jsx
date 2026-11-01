import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import {
  PARTY_HEADER_CLASS,
  PARTY_ICON_CLASS,
  PARTY_TEXT_CLASS,
  PARTY_COUNT_CLASS,
} from "../../../../shared/constants/matchingPopupStyles.js"

export default function MatchingPartyHeader({ visible, partyCount, transition }) {
  return (
    <motion.div
      className={PARTY_HEADER_CLASS}
      initial={{ opacity: 0 }}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={transition}
      aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
    >
      <PublicAsset
        src={GAME_MATCHING_ASSETS.silhouetteNotReady}
        alt=""
        className={PARTY_ICON_CLASS}
      />
      <span className={PARTY_TEXT_CLASS}>
        {MATCHING_POPUP_COPY.partyLabel}{" "}
        <span className={PARTY_COUNT_CLASS}>{partyCount}</span>명
      </span>
    </motion.div>
  )
}
