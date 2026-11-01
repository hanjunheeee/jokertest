// 방장 버튼 줄: 방 설정 변경·참가자 추방
// GameMatchingPage가 씀, 다른 창(설정·강퇴·친구 초대)이 떠 있으면 페이지가 안 그림
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import {
  BTN_SCALE_WRAP_CLASS,
  HOST_ACTION_BTN_CLASS,
  HOST_ACTION_BTN_LABEL_CLASS,
  HOST_ACTION_COL_CLASS,
} from "../../../../shared/constants/matchingPopupStyles.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 방장 버튼 묶음
export default function MatchingHostActionButtons({
  visible,
  canEditSettings,
  isKickHost,
  canKick,
  onOpenSettings,
  onOpenKickModal,
}) {
  // 설정도 못 바꾸고 방장도 아니면 안 그림
  if (!canEditSettings && !isKickHost) return null

  return (
    <motion.div
      className={HOST_ACTION_COL_CLASS}
      initial={{ opacity: 0, y: -8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {/* 설정 변경: 편집 자격 있을 때만 */}
      {canEditSettings ? (
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={MATCHING_POPUP_COPY.changeRoomSettings}
          className={HOST_ACTION_BTN_CLASS}
        >
          <span className={BTN_SCALE_WRAP_CLASS}>
            <PublicAsset
              src={GAME_MATCHING_ASSETS.startGameButton}
              alt=""
              className="block h-auto w-full select-none"
            />
            <span className={HOST_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
              {MATCHING_POPUP_COPY.changeRoomSettings}
            </span>
          </span>
        </button>
      ) : null}
      {/* 추방: 방장이면 보이되 방 확인 전엔 잠그고 title로 이유 보임 */}
      {isKickHost ? (
        <button
          type="button"
          onClick={canKick ? onOpenKickModal : undefined}
          disabled={!canKick}
          aria-label={MATCHING_POPUP_COPY.kickParticipant}
          title={canKick ? undefined : "방 정보를 서버에서 확인하는 중입니다"}
          className={HOST_ACTION_BTN_CLASS}
        >
          <span className={BTN_SCALE_WRAP_CLASS}>
            <PublicAsset
              src={GAME_MATCHING_ASSETS.deleteRoomButton}
              alt=""
              className="block h-auto w-full select-none"
            />
            <span className={HOST_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
              {MATCHING_POPUP_COPY.kickParticipant}
            </span>
          </span>
        </button>
      ) : null}
    </motion.div>
  )
}
