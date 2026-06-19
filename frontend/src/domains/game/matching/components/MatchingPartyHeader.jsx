/**
 * 매칭 대기 화면 파티 인원 헤더.
 *
 * GameMatchingPage에서 분리된 컴포넌트입니다.
 * visible·transition을 page로부터 받아 uiVisible 타이밍에 맞춰 페이드인됩니다.
 *
 * props
 * - visible: true가 되면 opacity 1로 전환
 * - partyCount: 현재 파티 인원 수 (aria-label과 화면 표시 겸용)
 * - transition: 부모 페이지의 UI_REVEAL_TRANSITION 공유 상수
 */
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import {
  MATCHING_PARTY_HEADER_CLASS,
  MATCHING_PARTY_ICON_CLASS,
  MATCHING_PARTY_TEXT_CLASS,
  MATCHING_PARTY_COUNT_CLASS,
} from "../constants/matchingPopupStyles.js"

export default function MatchingPartyHeader({ visible, partyCount, transition }) {
  return (
    <motion.div
      className={MATCHING_PARTY_HEADER_CLASS}
      initial={{ opacity: 0 }}
      animate={visible ? { opacity: 1 } : { opacity: 0 }} // uiVisible 기준으로 페이드인
      transition={transition}
      aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
    >
      <PublicAsset
        src={GAME_MATCHING_ASSETS.silhouetteNotReady}
        alt=""
        className={MATCHING_PARTY_ICON_CLASS}
      />
      <span className={MATCHING_PARTY_TEXT_CLASS}>
        {MATCHING_POPUP_COPY.partyLabel}{" "}
        <span className={MATCHING_PARTY_COUNT_CLASS}>{partyCount}</span>명
      </span>
    </motion.div>
  )
}
