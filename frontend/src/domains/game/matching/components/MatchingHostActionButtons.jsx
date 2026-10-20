/**
 * 방장 전용 — 좌측 상단 [방 설정 변경]·[참가자 추방] 이미지 버튼(가로 1줄).
 * 수락(설정) / 취소(추방) 리소스는 MatchingPopupPanel 하단 버튼과 동일하다.
 */
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import {
  MATCHING_BTN_SCALE_WRAP_CLASS,
  MATCHING_HOST_ACTION_BTN_CLASS,
  MATCHING_HOST_ACTION_BTN_LABEL_CLASS,
  MATCHING_HOST_ACTION_COL_CLASS,
} from "../constants/matchingPopupStyles.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function MatchingHostActionButtons({
  visible,
  canEditSettings,
  isKickHost,
  canKick,
  onOpenSettings,
  onOpenKickModal,
}) {
  if (!canEditSettings && !isKickHost) return null

  return (
    <motion.div
      className={MATCHING_HOST_ACTION_COL_CLASS}
      initial={{ opacity: 0, y: -8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {canEditSettings ? (
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={MATCHING_POPUP_COPY.changeRoomSettings}
          className={MATCHING_HOST_ACTION_BTN_CLASS}
        >
          <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
            <PublicAsset
              src={GAME_MATCHING_ASSETS.startGameButton}
              alt=""
              className="block h-auto w-full select-none"
            />
            <span className={MATCHING_HOST_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
              {MATCHING_POPUP_COPY.changeRoomSettings}
            </span>
          </span>
        </button>
      ) : null}
      {isKickHost ? (
        <button
          type="button"
          onClick={canKick ? onOpenKickModal : undefined}
          disabled={!canKick}
          aria-label={MATCHING_POPUP_COPY.kickParticipant}
          title={canKick ? undefined : "방 정보를 서버에서 확인하는 중입니다"}
          className={MATCHING_HOST_ACTION_BTN_CLASS}
        >
          <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
            <PublicAsset
              src={GAME_MATCHING_ASSETS.deleteRoomButton}
              alt=""
              className="block h-auto w-full select-none"
            />
            <span className={MATCHING_HOST_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
              {MATCHING_POPUP_COPY.kickParticipant}
            </span>
          </span>
        </button>
      ) : null}
    </motion.div>
  )
}
