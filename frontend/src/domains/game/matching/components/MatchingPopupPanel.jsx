// 대기방 가운데 팝업: 초대코드 버튼·자리 목록·아래쪽 버튼 줄
// MatchingRoomPanelArea가 씀, 방장은 준비·시작·삭제, 참가자는 준비·나가기
import { motion } from "framer-motion"
import {
  GAME_MATCHING_ASSETS,
  MATCHING_POPUP_COPY,
} from "../constants/gameMatchingAssets.js"
import {
  MATCHING_ACTION_BTN_ROW_CLASS,
  MATCHING_PANEL_WRAP_CLASS,
  MATCHING_BTN_SCALE_WRAP_CLASS,
  MATCHING_ROOM_CODE_BTN_LABEL_CLASS,
  MATCHING_ROOM_CODE_BTN_WRAP_CLASS,
  MATCHING_START_GAME_BTN_AREA_CLASS,
  MATCHING_TITLE_CLASS,
} from "../constants/matchingPopupStyles.js"
import MatchingPopupContent from "./MatchingPopupContent.jsx"
import MatchingActionButton from "./MatchingActionButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function MatchingPopupPanel({
  visible,
  slots,
  waitingMessage = "",
  onRoomCodeView,
  isHost,
  isReady,
  isSettingReady,
  onToggleReady,
  isStarting,
  isRoomVerified,
  onStartGame,
  onDeleteRoom,
  onLeaveRoom,
}) {
  // 준비 버튼: 요청 중 / 준비 해제 / 준비 문구, 준비 중이면 삭제 버튼 그림으로 바뀜
  const readyLabel = isSettingReady ? MATCHING_POPUP_COPY.readyPending : isReady ? MATCHING_POPUP_COPY.readyOff : MATCHING_POPUP_COPY.readyOn
  const readySrc = isReady ? GAME_MATCHING_ASSETS.deleteRoomButton : GAME_MATCHING_ASSETS.startGameButton
  const readyDisabled = isSettingReady || !isRoomVerified

  return (
    <div
      className={MATCHING_PANEL_WRAP_CLASS}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <motion.div
        className="relative w-full"
        initial={{ opacity: 0, y: 12 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={UI_REVEAL_TRANSITION}
      >
        <button
          type="button"
          aria-label="초대코드 공유"
          onClick={onRoomCodeView}
          className={MATCHING_ROOM_CODE_BTN_WRAP_CLASS}
        >
          <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
            <PublicAsset
              src={GAME_MATCHING_ASSETS.roomCodeViewButton}
              alt=""
              className="block h-auto w-full select-none"
            />
            <span className={MATCHING_ROOM_CODE_BTN_LABEL_CLASS}>초대코드 공유</span>
          </span>
        </button>

        <PublicAsset
          src={GAME_MATCHING_ASSETS.popupFrame}
          alt="멀티 플레이 매칭"
          className="pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
        />

        <p className={MATCHING_TITLE_CLASS}>{MATCHING_POPUP_COPY.title}</p>
        <MatchingPopupContent
          slots={slots}
          waitingMessage={waitingMessage}
        />

        <div className={MATCHING_START_GAME_BTN_AREA_CLASS}>
          <motion.div
            className={MATCHING_ACTION_BTN_ROW_CLASS}
            initial={{ opacity: 0, y: 6 }}
            animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={{ ...UI_REVEAL_TRANSITION, delay: 0.08 }}
          >
            {isHost ? (
              <>
                <MatchingActionButton
                  label={readyLabel}
                  src={readySrc}
                  onClick={onToggleReady}
                  disabled={readyDisabled}
                />
                <MatchingActionButton
                  label={isStarting ? MATCHING_POPUP_COPY.startingGame : MATCHING_POPUP_COPY.startGame}
                  src={GAME_MATCHING_ASSETS.startGameButton}
                  onClick={onStartGame}
                  disabled={isStarting}
                />
                <MatchingActionButton
                  label={MATCHING_POPUP_COPY.deleteRoom}
                  src={GAME_MATCHING_ASSETS.deleteRoomButton}
                  onClick={onDeleteRoom}
                />
              </>
            ) : (
              <>
                <MatchingActionButton
                  label={readyLabel}
                  src={readySrc}
                  onClick={onToggleReady}
                  disabled={readyDisabled}
                />
                <MatchingActionButton
                  label={MATCHING_POPUP_COPY.leaveRoom}
                  src={GAME_MATCHING_ASSETS.deleteRoomButton}
                  onClick={onLeaveRoom}
                />
              </>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
