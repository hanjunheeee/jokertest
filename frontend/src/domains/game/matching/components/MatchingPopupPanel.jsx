import { motion } from "framer-motion"
import {
  GAME_MATCHING_ASSETS,
  MATCHING_POPUP_COPY,
} from "../constants/gameMatchingAssets.js"
import {
  MATCHING_ACTION_BTN_CLASS,
  MATCHING_ACTION_BTN_LABEL_CLASS,
  MATCHING_ACTION_BTN_ROW_CLASS,
  MATCHING_BTN_SCALE_WRAP_CLASS,
  MATCHING_ROOM_CODE_BTN_LABEL_CLASS,
  MATCHING_ROOM_CODE_BTN_WRAP_CLASS,
  MATCHING_START_GAME_BTN_AREA_CLASS,
  MATCHING_TITLE_CLASS,
} from "../constants/matchingPopupStyles.js"
import MatchingPopupContent from "./MatchingPopupContent.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

const PANEL_WRAP_CLASS =
  "absolute left-1/2 top-[48%] z-20 flex w-[min(58rem,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col items-center origin-center scale-[0.92]"

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
                <button
                  type="button"
                  aria-label={isSettingReady ? MATCHING_POPUP_COPY.readyPending : isReady ? MATCHING_POPUP_COPY.readyOff : MATCHING_POPUP_COPY.readyOn}
                  onClick={onToggleReady}
                  disabled={isSettingReady || !isRoomVerified}
                  className={MATCHING_ACTION_BTN_CLASS}
                >
                  <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
                    <PublicAsset
                      src={isReady ? GAME_MATCHING_ASSETS.deleteRoomButton : GAME_MATCHING_ASSETS.startGameButton}
                      alt=""
                      className="block h-auto w-full select-none"
                    />
                    <span className={MATCHING_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
                      {isSettingReady ? MATCHING_POPUP_COPY.readyPending : isReady ? MATCHING_POPUP_COPY.readyOff : MATCHING_POPUP_COPY.readyOn}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={isStarting ? MATCHING_POPUP_COPY.startingGame : MATCHING_POPUP_COPY.startGame}
                  onClick={onStartGame}
                  disabled={isStarting}
                  className={MATCHING_ACTION_BTN_CLASS}
                >
                  <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
                    <PublicAsset src={GAME_MATCHING_ASSETS.startGameButton} alt="" className="block h-auto w-full select-none" />
                    <span className={MATCHING_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
                      {isStarting ? MATCHING_POPUP_COPY.startingGame : MATCHING_POPUP_COPY.startGame}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={MATCHING_POPUP_COPY.deleteRoom}
                  onClick={onDeleteRoom}
                  className={MATCHING_ACTION_BTN_CLASS}
                >
                  <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
                    <PublicAsset src={GAME_MATCHING_ASSETS.deleteRoomButton} alt="" className="block h-auto w-full select-none" />
                    <span className={MATCHING_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
                      {MATCHING_POPUP_COPY.deleteRoom}
                    </span>
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={isSettingReady ? MATCHING_POPUP_COPY.readyPending : isReady ? MATCHING_POPUP_COPY.readyOff : MATCHING_POPUP_COPY.readyOn}
                  onClick={onToggleReady}
                  disabled={isSettingReady || !isRoomVerified}
                  className={MATCHING_ACTION_BTN_CLASS}
                >
                  <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
                    <PublicAsset
                      src={isReady ? GAME_MATCHING_ASSETS.deleteRoomButton : GAME_MATCHING_ASSETS.startGameButton}
                      alt=""
                      className="block h-auto w-full select-none"
                    />
                    <span className={MATCHING_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
                      {isSettingReady ? MATCHING_POPUP_COPY.readyPending : isReady ? MATCHING_POPUP_COPY.readyOff : MATCHING_POPUP_COPY.readyOn}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={MATCHING_POPUP_COPY.leaveRoom}
                  onClick={onLeaveRoom}
                  className={MATCHING_ACTION_BTN_CLASS}
                >
                  <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
                    <PublicAsset src={GAME_MATCHING_ASSETS.deleteRoomButton} alt="" className="block h-auto w-full select-none" />
                    <span className={MATCHING_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
                      {MATCHING_POPUP_COPY.leaveRoom}
                    </span>
                  </span>
                </button>
              </>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
