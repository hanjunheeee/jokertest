// 대기방 위 줄: 방 이름과 앉은 수/정원·파티 인원 (친구 초대·뒤로는 shell 하단)
// GameMatchingPage가 씀, 데스크톱 오른쪽 위 인원 머리말과 같음
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import {
  PARTY_COUNT_CLASS,
  PARTY_ICON_CLASS,
  PARTY_TEXT_CLASS,
  ROOM_CAPACITY_CLASS,
  ROOM_INFO_ROW_CLASS,
  ROOM_TITLE_CLASS,
} from "../../constants/matchingMobileStyles.js"

// 위 줄 (방 이름·정원은 값이 있을 때만)
export default function MatchingTopBar({ visible, partyCount, partyMax = null, roomTitle = null }) {
  return (
    <motion.header
      className="sticky top-0 z-20 flex h-14 items-center justify-center gap-2 px-3 land:h-12"
      initial={{ opacity: 0 }}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
      aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
    >
      <div className="flex min-w-0 flex-col items-center justify-center">
        {/* 방 이름 + 앉은 수/정원 (값이 없는 쪽은 안 그림, 둘 다 없으면 줄째 안 그림) */}
        {roomTitle || partyMax !== null ? (
          <div className={ROOM_INFO_ROW_CLASS} data-testid="matching-room-info">
            {roomTitle ? (
              <h1 className={ROOM_TITLE_CLASS} data-testid="matching-room-title">{roomTitle}</h1>
            ) : null}
            {partyMax !== null ? (
              <span className={ROOM_CAPACITY_CLASS} data-testid="matching-party-capacity">
                <span aria-hidden="true">{partyCount}/{partyMax}</span>
                <span className="sr-only">앉은 사람 {partyCount}명, 정원 {partyMax}명</span>
              </span>
            ) : null}
          </div>
        ) : null}

        {/* 파티 인원 (데스크톱 MatchingPartyHeader) */}
        <div className="flex min-w-0 items-center gap-2">
          <PublicAsset src={GAME_MATCHING_ASSETS.silhouetteNotReady} alt="" className={PARTY_ICON_CLASS} />
          <span className={PARTY_TEXT_CLASS}>
            {MATCHING_POPUP_COPY.partyLabel} <span className={PARTY_COUNT_CLASS}>{partyCount}</span>명
          </span>
        </div>
      </div>
    </motion.header>
  )
}
