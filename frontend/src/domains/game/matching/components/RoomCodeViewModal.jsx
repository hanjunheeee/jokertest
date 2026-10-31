import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import RoomCodeFrame from "../../mode/components/RoomCodeFrame.jsx"
import { ROOM_INVITE_ASSETS } from "../../mode/constants/roomInviteAssets.js"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import {
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "../../mode/constants/roomCodeFrameStyles.js"
import {
  MATCHING_BTN_SCALE_WRAP_CLASS,
  MATCHING_BTN_IMG_SCALE_CLASS,
  MATCHING_MODAL_CLOSE_BTN_CLASS,
} from "../constants/matchingPopupStyles.js"
import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_COPY_RESULTS,
  isValidRoomCode,
  normalizeRoomCode,
  resolveRoomCodeCopy,
  resolveRoomCodeCopyStatus,
} from "../utils/roomCode.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

const MODAL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

const POPUP_CLOSE_BUTTON = "/button/팝업 닫기 버튼.png"

const COPY_BTN_CLASS =
  "group pointer-events-auto mx-auto w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"
const COPY_BTN_DISABLED_CLASS =
  "group pointer-events-auto mx-auto w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-not-allowed border-0 bg-transparent p-0 leading-none opacity-50"

const COPY_ERROR_CLASS =
  "mx-auto mt-[0.6rem] max-w-[90%] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.15vw,0.95rem)] font-semibold leading-snug text-[#ffb3a7] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

const FRAME_VARIANTS = {
  hidden: {
    opacity: 0,
    y: -14,
    rotate: -1,
    scale: 0.99,
  },
  visible: {
    opacity: 1,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 32,
      mass: 1,
    },
  },
}

export default function RoomCodeViewModal({ open, onClose, roomCode }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState("")
  const [copyStatus, setCopyStatus] = useState("")
  const copyFeedbackTimerRef = useRef(null)
  const copyGenerationRef = useRef(0)
  const copyErrorId = useId()

  const displayRoomCode = normalizeRoomCode(roomCode)
  const canCopy = isValidRoomCode(displayRoomCode)

  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const socketId = socket?.id ?? null

  const clearCopyFeedbackTimer = () => {
    if (!copyFeedbackTimerRef.current) return
    window.clearTimeout(copyFeedbackTimerRef.current)
    copyFeedbackTimerRef.current = null
  }

  const invalidateCopyFeedback = () => {
    copyGenerationRef.current += 1
    clearCopyFeedbackTimer()
    setCopied(false)
    setCopyError("")
    setCopyStatus("")
  }

  useEffect(() => {
    invalidateCopyFeedback()
    return () => {
      copyGenerationRef.current += 1
      clearCopyFeedbackTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, displayRoomCode, authUuid, identityGeneration, socket, socketId])

  const handleClose = () => {
    invalidateCopyFeedback()
    onClose()
  }

  const handleCopy = async () => {
    const outcome = resolveRoomCodeCopy(displayRoomCode)

    if (!outcome.ok) {
      invalidateCopyFeedback()
      setCopyError(outcome.error)
      setCopyStatus(resolveRoomCodeCopyStatus(displayRoomCode))
      return
    }

    invalidateCopyFeedback()
    const generation = copyGenerationRef.current

    try {
      await navigator.clipboard.writeText(outcome.value)
      if (copyGenerationRef.current !== generation) return
      setCopied(true)
      setCopyError("")
      setCopyStatus(ROOM_CODE_COPY_RESULTS.COPY_SUCCEEDED)
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        if (copyGenerationRef.current !== generation) return
        setCopied(false)
        copyFeedbackTimerRef.current = null
      }, 2000)
    } catch {
      if (copyGenerationRef.current !== generation) return
      setCopied(false)
      setCopyError(ROOM_CODE_COPY_ERRORS.CLIPBOARD_FAILED)
      setCopyStatus(ROOM_CODE_COPY_RESULTS.CLIPBOARD_FAILED)
    }
  }

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
                    className={MATCHING_MODAL_CLOSE_BTN_CLASS}
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
                      <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
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
