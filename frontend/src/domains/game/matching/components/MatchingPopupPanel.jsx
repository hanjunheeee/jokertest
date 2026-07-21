/**
 * 매칭 팝업 패널 (prototype: 매칭 팝업 프레임.png)
 * GameMatchingPage 중앙 — 방코드 보기·본문·하단 액션 버튼
 *
 * props
 * - visible: true면 입장 연출 후 클릭 허용 (부모 uiVisible과 동기)
 * - slots: 파티 슬롯 실데이터 또는 더미 — MatchingPopupContent·MatchingPartySlots로 전달
 * - onRoomCodeView: "방코드 보기" 클릭 시 호출 (부모에서 모달 열기)
 * - isHost: true면 게임시작·방 삭제 표시, false면 방 나가기 표시(준비 버튼은 방장·비방장 공통)
 * - isReady, isSettingReady, onToggleReady: 본인 준비 상태·요청 중 여부·토글 콜백(공통)
 * - canStart, isStarting: 서버가 계산한 시작 가능 여부·시작 요청 진행 중 여부(게임시작 버튼 비활성화에 사용)
 * - onStartGame, onDeleteRoom: 방장 전용 콜백
 * - onLeaveRoom: 비방장 전용 콜백
 *
 * 에셋·카피·스타일은 constants/gameMatchingAssets.js, matchingPopupStyles.js 참고
 */
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

/** 프레임·방코드 보기·본문·게임시작/방삭제 버튼을 묶는 매칭 팝업 */
export default function MatchingPopupPanel({
  visible,
  slots,
  onRoomCodeView,
  isHost,
  isReady,
  isSettingReady,
  onToggleReady,
  canStart,
  isStarting,
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
        <MatchingPopupContent slots={slots} />

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
                  disabled={isSettingReady}
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
                  disabled={!canStart || isStarting}
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
              // 비방장: 준비 완료/취소 버튼 + 방 나가기 버튼 표시
              <>
                <button
                  type="button"
                  aria-label={isSettingReady ? MATCHING_POPUP_COPY.readyPending : isReady ? MATCHING_POPUP_COPY.readyOff : MATCHING_POPUP_COPY.readyOn}
                  onClick={onToggleReady}
                  disabled={isSettingReady}
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
