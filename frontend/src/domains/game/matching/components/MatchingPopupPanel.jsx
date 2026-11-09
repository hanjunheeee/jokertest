// 대기방 가운데 팝업: 초대코드 버튼·자리 목록·아래쪽 버튼 줄
// MatchingRoomPanelArea가 씀, 방장은 준비·시작·삭제, 참가자는 준비·나가기
import { motion } from "framer-motion"
import {
  GAME_MATCHING_ASSETS,
  MATCHING_POPUP_COPY,
} from "../constants/gameMatchingAssets.js"
import {
  ACTION_BTN_ROW_CLASS,
  PANEL_WRAP_CLASS,
  BTN_SCALE_WRAP_CLASS,
  ROOM_CODE_BTN_LABEL_CLASS,
  ROOM_CODE_BTN_WRAP_CLASS,
  START_GAME_BTN_AREA_CLASS,
  MATCHING_TITLE_CLASS,
} from "../../../../shared/constants/matchingPopupStyles.js"
import MatchingPopupContent from "./MatchingPopupContent.jsx"
import MatchingActionButton from "./MatchingActionButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 대기방 가운데 팝업
// 요청 중이 먼저, 그다음 준비 여부
function pickReadyLabel({ isSettingReady, isReady }) {
  if (isSettingReady) return MATCHING_POPUP_COPY.readyPending
  if (isReady) return MATCHING_POPUP_COPY.readyOff
  return MATCHING_POPUP_COPY.readyOn
}

export default function MatchingPopupPanel({
  visible,
  slots,
  waitingMessage = "",
  onRoomCodeView,
  roomCodeDisabled = false,
  isHost,
  isReady,
  isSettingReady,
  onToggleReady,
  isStarting,
  isRoomVerified,
  onStartGame,
  onDeleteRoom,
  isDeleting = false,
  onLeaveRoom,
}) {
  // 준비 버튼 글자: 요청 중 / 준비취소 / 준비완료, 준비한 상태면 취소(부정) 버튼 그림 씀
  const readyLabel = pickReadyLabel({ isSettingReady, isReady })
  const readySrc = isReady ? GAME_MATCHING_ASSETS.deleteRoomButton : GAME_MATCHING_ASSETS.startGameButton
  // 요청 중이거나 방 확인 전이면 준비 버튼 잠금
  const readyDisabled = isSettingReady || !isRoomVerified

  return (
    <div
      className={PANEL_WRAP_CLASS}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <motion.div
        className="relative w-full"
        initial={{ opacity: 0, y: 12 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={UI_REVEAL_TRANSITION}
      >
        {/* 초대코드 공유 버튼 (누르면 방코드 창, 확인된 방이 없으면 잠금) */}
        <button
          type="button"
          aria-label="초대코드 공유"
          onClick={onRoomCodeView}
          disabled={roomCodeDisabled}
          className={`${ROOM_CODE_BTN_WRAP_CLASS} disabled:cursor-default disabled:opacity-60`}
        >
          <span className={BTN_SCALE_WRAP_CLASS}>
            <PublicAsset
              src={GAME_MATCHING_ASSETS.roomCodeViewButton}
              alt=""
              className="block h-auto w-full select-none"
            />
            <span className={ROOM_CODE_BTN_LABEL_CLASS}>초대코드 공유</span>
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

        <div className={START_GAME_BTN_AREA_CLASS}>
          <motion.div
            className={ACTION_BTN_ROW_CLASS}
            initial={{ opacity: 0, y: 6 }}
            animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={{ ...UI_REVEAL_TRANSITION, delay: 0.08 }}
          >
            {/* 방장: 준비·시작·삭제 / 참가자: 준비·나가기 */}
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
                  disabled={isDeleting}
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
