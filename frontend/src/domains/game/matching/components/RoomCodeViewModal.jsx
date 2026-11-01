// 대기방 방코드 보기 모달: 코드 프레임 + 복사 버튼
// MatchingRoomPanelArea가 씀, 복사 상태는 useRoomCodeCopy가 맡음
import { AnimatePresence, motion } from "framer-motion"
import { useId } from "react"
import RoomCodeFrame from "../../mode/components/RoomCodeFrame.jsx"
import { ROOM_INVITE_ASSETS } from "../../mode/constants/roomInviteAssets.js"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import {
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "../../mode/constants/roomCodeFrameStyles.js"
import {
  BTN_SCALE_WRAP_CLASS,
  MATCHING_BTN_IMG_SCALE_CLASS,
  MODAL_CLOSE_BTN_CLASS,
} from "../constants/matchingPopupStyles.js"
import {
  COPY_BTN_CLASS,
  COPY_BTN_DISABLED_CLASS,
  COPY_ERROR_CLASS,
  FRAME_VARIANTS,
  MODAL_TRANSITION,
  POPUP_CLOSE_BUTTON,
} from "../constants/roomCodeViewModal.js"
import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_COPY_RESULTS,
  isValidRoomCode,
  normalizeRoomCode,
} from "../utils/roomCode.js"
import { useRoomCodeCopy } from "../hooks/useRoomCodeCopy.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function RoomCodeViewModal({ open, onClose, roomCode }) {
  const copyErrorId = useId()

  // 표시값은 정규화한 코드, 형식이 맞을 때만 복사 가능
  const displayRoomCode = normalizeRoomCode(roomCode)
  const canCopy = isValidRoomCode(displayRoomCode)

  const { copied, copyError, copyStatus, handleClose, handleCopy } =
    useRoomCodeCopy({ open, displayRoomCode, onClose })

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="방코드 보기 닫기"
            className="absolute inset-0 z-40 cursor-default border-0 bg-black/60 p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MODAL_TRANSITION}
            onClick={handleClose}
          />

          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center px-[clamp(1rem,4vw,2.5rem)]">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="방코드"
              className="pointer-events-auto w-full max-w-[min(52rem,94vw)]"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={FRAME_VARIANTS}
              onClick={(event) => event.stopPropagation()}
            >
              <RoomCodeFrame
                frameSrc={GAME_MATCHING_ASSETS.roomCodeShareFrame}
                frameAlt="초대 방코드"
                value={displayRoomCode}
                onChange={() => {}}
                readOnly
                overlay={
                  <button
                    type="button"
                    aria-label="방코드 팝업 닫기"
                    onClick={handleClose}
                    className={MODAL_CLOSE_BTN_CLASS}
                  >
                    <PublicAsset
                      src={POPUP_CLOSE_BUTTON}
                      alt=""
                      className={MATCHING_BTN_IMG_SCALE_CLASS}
                    />
                  </button>
                }
                footer={
                  <>
                    <button
                      type="button"
                      aria-label={copied ? "방코드 복사됨" : "방코드 복사"}
                      aria-describedby={copyError ? copyErrorId : undefined}
                      onClick={handleCopy}
                      disabled={!canCopy}
                      data-copy-status={copyStatus || (canCopy ? "" : ROOM_CODE_COPY_RESULTS.CODE_UNAVAILABLE)}
                      className={canCopy ? COPY_BTN_CLASS : COPY_BTN_DISABLED_CLASS}
                    >
                      <span className={BTN_SCALE_WRAP_CLASS}>
                        <PublicAsset
                          src={ROOM_INVITE_ASSETS.joinButton}
                          alt=""
                          className="block h-auto w-full select-none"
                        />
                        <span className={ROOM_CODE_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
                          {copied ? "복사됨" : "방코드 복사"}
                        </span>
                      </span>
                    </button>

                    <p id={copyErrorId} role="alert" className={COPY_ERROR_CLASS}>
                      {copyError || (canCopy ? "" : ROOM_CODE_COPY_ERRORS.UNAVAILABLE)}
                    </p>
                  </>
                }
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
