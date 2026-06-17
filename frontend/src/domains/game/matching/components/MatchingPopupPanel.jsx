/**
 * 매칭 팝업 패널 (prototype: 매칭 팝업 프레임.png)
 * GameMatchingPage 중앙 — 방코드 보기·본문·하단 액션 버튼
 *
 * props
 * - visible: true면 입장 연출 후 클릭 허용 (부모 uiVisible과 동기)
 * - slots: 파티 슬롯 더미/실데이터 — MatchingPopupContent·MatchingPartySlots로 전달
 * - onRoomCodeView: "방코드 보기" 클릭 시 호출 (부모에서 모달 열기)
 *
 * 게임시작·방 삭제 버튼은 미구현 (TODO: 방장 권한·API 연동)
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
export default function MatchingPopupPanel({ visible, slots, onRoomCodeView }) {
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
          aria-label="방코드 보기"
          onClick={onRoomCodeView}
          className={MATCHING_ROOM_CODE_BTN_WRAP_CLASS}
          style={{ outline: "none" }}
        >
          <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
            <PublicAsset
              src={GAME_MATCHING_ASSETS.roomCodeViewButton}
              alt=""
              className="block h-auto w-full select-none"
            />
            <span className={MATCHING_ROOM_CODE_BTN_LABEL_CLASS}>방코드 보기</span>
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
            {/* 미구현 (TODO: 게임 시작 API) */}
            <button
              type="button"
              aria-label={MATCHING_POPUP_COPY.startGame}
              className={MATCHING_ACTION_BTN_CLASS}
              style={{ outline: "none" }}
            >
              <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
                <PublicAsset
                  src={GAME_MATCHING_ASSETS.startGameButton}
                  alt=""
                  className="block h-auto w-full select-none"
                />
                <span
                  className={MATCHING_ACTION_BTN_LABEL_CLASS}
                  aria-hidden="true"
                >
                  {MATCHING_POPUP_COPY.startGame}
                </span>
              </span>
            </button>
            {/* 미구현 (TODO: 방 삭제 API) */}
            <button
              type="button"
              aria-label={MATCHING_POPUP_COPY.deleteRoom}
              className={MATCHING_ACTION_BTN_CLASS}
              style={{ outline: "none" }}
            >
              <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
                <PublicAsset
                  src={GAME_MATCHING_ASSETS.deleteRoomButton}
                  alt=""
                  className="block h-auto w-full select-none"
                />
                <span
                  className={MATCHING_ACTION_BTN_LABEL_CLASS}
                  aria-hidden="true"
                >
                  {MATCHING_POPUP_COPY.deleteRoom}
                </span>
              </span>
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
