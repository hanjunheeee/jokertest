// 방장 버튼 줄: 방 설정 변경·참가자 추방
// GameMatchingPage가 판 위 왼쪽에 씀, 조건·글·그림·순서는 데스크톱 MatchingHostActionButtons(왼쪽 위)와 같음
import { motion } from "framer-motion"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { HOST_BUTTON_LOOK } from "../../constants/matchingMobileStyles.js"

// 방장 버튼 묶음 (설정도 못 바꾸고 방장도 아니면 빈 자리), hidden이면 자리만 남기고 숨김
export default function HostActions({ visible, hidden, canEditSettings, isKickHost, canKick, onOpenSettings, onOpenKickModal }) {
  if (!canEditSettings && !isKickHost) return <div />

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
      {/* 추방: 방장이면 보이되 방 확인 전엔 잠그고 title로 이유 보임 */}
      {isKickHost ? (
        <ImageButton
          look={HOST_BUTTON_LOOK}
          label={MATCHING_POPUP_COPY.kickParticipant}
          src={GAME_MATCHING_ASSETS.deleteRoomButton}
          onClick={canKick ? onOpenKickModal : undefined}
          disabled={!canKick}
          title={canKick ? undefined : "방 정보를 서버에서 확인하는 중입니다"}
        />
      ) : null}
    </motion.div>
  )
}
