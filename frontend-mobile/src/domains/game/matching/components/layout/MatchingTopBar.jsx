// 대기방 위 줄: 방 이름("○○의 방")·파티 인원·앉은 수/정원 표시
// GameMatchingPage가 사용, 값이 없는 칸은 생략함
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import {
  PARTY_CAPACITY_BADGE_CLASS,
  PARTY_COUNT_CLASS,
  PARTY_ICON_CLASS,
  PARTY_TEXT_CLASS,
  ROOM_TITLE_BADGE_CLASS,
} from "../../constants/matchingMobileStyles.js"

// 대기방 상단 머리말 줄
export default function MatchingTopBar({ visible, roomTitle = null, partyCount = 0, partyMax = null }) {
  return (
    <motion.header
      className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-1 land:min-h-12"
      initial={{ opacity: 0 }}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {roomTitle ? (
        <h1 className={ROOM_TITLE_BADGE_CLASS} data-testid="matching-room-title">
          {roomTitle}
        </h1>
      ) : null}

      <div
        className="flex shrink-0 items-center gap-1.5"
        aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
      >
        <PublicAsset src={GAME_MATCHING_ASSETS.silhouetteNotReady} alt="" className={PARTY_ICON_CLASS} />
        <span className={PARTY_TEXT_CLASS}>
          {MATCHING_POPUP_COPY.partyLabel} <span className={PARTY_COUNT_CLASS}>{partyCount}</span>명
        </span>
      </div>

      {partyMax !== null ? (
        <span className={PARTY_CAPACITY_BADGE_CLASS} data-testid="matching-party-capacity">
          <span aria-hidden="true">{partyCount}/{partyMax}</span>
          <span className="sr-only">앉은 사람 {partyCount}명, 정원 {partyMax}명</span>
        </span>
      ) : null}
    </motion.header>
  )
}
