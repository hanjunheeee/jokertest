// 방장 버튼 줄: 방 설정 변경·참가자 추방, 추방이 잠겼으면 까닭 글
// GameMatchingPage가 판 위 왼쪽에 씀, 조건·글·그림·순서는 데스크톱 MatchingHostActionButtons(왼쪽 위)와 같음
import { useId } from "react"
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { HOST_BUTTON_LOOK } from "../../constants/matchingMobileStyles.js"

// 방장 버튼 묶음 (설정도 못 바꾸고 방장도 아니면 빈 자리), hidden이면 자리만 남기고 숨김
export default function HostActions({ visible, hidden, canEditSettings, isKickHost, canKick, kickLockedReason = null, onOpenSettings, onOpenKickModal }) {
  const kickReasonId = useId()
  if (!canEditSettings && !isKickHost) return <div />
  // 폰은 마우스 올림 글이 안 보여 잠긴 까닭을 화면 글로 띄움
  const showKickReason = isKickHost && !canKick

  return (
    <motion.div
      className={`flex flex-nowrap items-center gap-1.5 ${hidden ? "invisible" : ""}`}
      initial={{ opacity: 0, y: -8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible && !hidden ? "auto" : "none" }}
    >
      {/* 설정 변경: 편집 자격 있을 때만 */}
      {canEditSettings ? (
        <ImageButton
          look={HOST_BUTTON_LOOK}
          label={MATCHING_POPUP_COPY.changeRoomSettings}
          src={GAME_MATCHING_ASSETS.startGameButton}
          onClick={onOpenSettings}
        />
      ) : null}
      {/* 추방: 방장이면 보이되 방 확인 전엔 잠그고 옆에 까닭 글 (끊김·확인 중·확인 실패마다 글이 다름) */}
      {isKickHost ? (
        <ImageButton
          look={HOST_BUTTON_LOOK}
          label={MATCHING_POPUP_COPY.kickParticipant}
          src={GAME_MATCHING_ASSETS.deleteRoomButton}
          onClick={canKick ? onOpenKickModal : undefined}
          disabled={!canKick}
          aria-describedby={showKickReason ? kickReasonId : undefined}
        />
      ) : null}
      {showKickReason ? (
        <p
          id={kickReasonId}
          role="status"
          data-testid="kick-locked-reason"
          className="min-w-0 max-w-[11rem] rounded-sm border border-[#3a2818]/70 bg-[#120a06]/85 px-2 py-1 font-subheading app-text-scaled [--app-text-size:0.72rem] font-bold leading-snug text-[#f5f0e6]"
        >
          {kickLockedReason ?? INGAME_KICK_PLAYER_MODAL_COPY.lockedReason}
        </p>
      ) : null}
    </motion.div>
  )
}
