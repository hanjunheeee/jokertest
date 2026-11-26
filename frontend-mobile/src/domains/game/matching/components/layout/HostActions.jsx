// 방장 단추 줄: 방 설정 변경·참가자 추방 및 추방 잠김 까닭 글 표시
// GameMatchingPage가 판 위 왼쪽에 사용, 다른 창이 열리면 자리만 남기고 숨김
import { useId } from "react"
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { HOST_BUTTON_LOOK, KICK_LOCKED_REASON_CLASS } from "../../constants/matchingMobileStyles.js"

// 방장 단추 묶음 (설정도 못 바꾸고 방장도 아니면 빈 자리 유지)
export default function HostActions({
  visible,
  hidden,
  canEditSettings,
  isKickHost,
  canKick,
  kickLockedReason = null,
  onOpenSettings,
  onOpenKickModal,
}) {
  const kickReasonId = useId()
  if (!canEditSettings && !isKickHost) return <div />

  const showKickReason = Boolean(isKickHost && !canKick)
  const reasonText = kickLockedReason ?? INGAME_KICK_PLAYER_MODAL_COPY.lockedReason

  return (
    <motion.div
      className={`flex ${showKickReason ? "flex-col items-start gap-1" : "flex-nowrap items-center gap-1.5"} ${hidden ? "invisible" : ""}`}
      initial={{ opacity: 0, y: -8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible && !hidden ? "auto" : "none" }}
    >
      {canEditSettings ? (
        <ImageButton
          look={HOST_BUTTON_LOOK}
          label={MATCHING_POPUP_COPY.changeRoomSettings}
          src={GAME_MATCHING_ASSETS.startGameButton}
          onClick={onOpenSettings}
        />
      ) : null}
      {/* 추방: 방장이면 보이되 방 확인 전엔 잠그고 까닭 글을 함께 노출함 */}
      {isKickHost ? (
        <ImageButton
          look={HOST_BUTTON_LOOK}
          label={MATCHING_POPUP_COPY.kickParticipant}
          src={GAME_MATCHING_ASSETS.deleteRoomButton}
          onClick={canKick ? onOpenKickModal : undefined}
          disabled={!canKick}
          aria-describedby={showKickReason ? kickReasonId : undefined}
          title={showKickReason ? reasonText : undefined}
        />
      ) : null}
      {showKickReason ? (
        <p id={kickReasonId} role="status" data-testid="kick-locked-reason" className={KICK_LOCKED_REASON_CLASS}>
          {reasonText}
        </p>
      ) : null}
    </motion.div>
  )
}
