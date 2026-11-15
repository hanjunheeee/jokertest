// 방장 버튼 줄: 방 설정 변경·참가자 추방, 추방이 잠겼으면 까닭 글
// GameMatchingPage가 씀, 다른 창(설정·강퇴·친구 초대)이 떠 있으면 페이지가 안 그림
import { useId } from "react"
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
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"

// 추방 잠긴 까닭 글 칸 (마우스 올림 글은 안 보이는 일이 많아 화면에 글로 띄움, 어두운 바탕에 밝은 글자)
const KICK_LOCKED_REASON_CLASS =
  "max-w-[clamp(9rem,18vw,13rem)] rounded-sm border border-[#3a2818]/70 bg-[#120a06]/85 px-2 py-1 font-subheading text-[clamp(0.62rem,0.9vw,0.75rem)] font-bold leading-snug text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 방장 버튼 묶음
export default function MatchingHostActionButtons({
  visible,
  canEditSettings,
  isKickHost,
  canKick,
  onOpenSettings,
  onOpenKickModal,
}) {
  const kickReasonId = useId()

  // 설정도 못 바꾸고 방장도 아니면 안 그림
  if (!canEditSettings && !isKickHost) return null
  const showKickReason = isKickHost && !canKick

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
      {/* 추방: 방장이면 보이되 방 확인 전엔 잠그고 옆에 까닭 글 */}
      {isKickHost ? (
        <button
          type="button"
          onClick={canKick ? onOpenKickModal : undefined}
          disabled={!canKick}
          aria-label={MATCHING_POPUP_COPY.kickParticipant}
          aria-describedby={showKickReason ? kickReasonId : undefined}
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
      {showKickReason ? (
        <p id={kickReasonId} role="status" data-testid="kick-locked-reason" className={KICK_LOCKED_REASON_CLASS}>
          {INGAME_KICK_PLAYER_MODAL_COPY.lockedReason}
        </p>
      ) : null}
    </motion.div>
  )
}
