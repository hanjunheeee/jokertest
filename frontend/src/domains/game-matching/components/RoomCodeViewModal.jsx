import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import { ROOM_INVITE_ASSETS } from "@/domains/game-mode/constants/roomInviteAssets.js"
import RoomCodeInput from "@/domains/game-mode/components/RoomCodeInput.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const MODAL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

const POPUP_CLOSE_BUTTON = "/button/팝업 닫기 버튼.png"

const CLOSE_BTN_CLASS =
  "absolute right-[clamp(-0.4rem,-1%,-0.15rem)] top-[clamp(0.95rem,4.2%,1.65rem)] z-20 block w-[clamp(3.75rem,7.4vw,5.1rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

const COPY_BTN_CLASS =
  "relative w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

/** 프레임 PNG 내부 하단 버튼 영역 (RoomInvitePage와 동일) */
const FRAME_INSET = {
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
  paddingBottom: "7.5%",
}

const COPY_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(1.05rem,1.55vw,1.3rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

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

/** 프레임 PNG에 그려진 6칸 입력 슬롯 위치 (RoomInvitePage와 동일) */
const CODE_INPUT_INSET = {
  top: "48.4%",
  left: "10.6%",
  right: "12.6%",
  height: "12.8%",
}

export default function RoomCodeViewModal({ open, onClose, roomCode }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
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
            onClick={onClose}
          />

          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center px-[clamp(1rem,4vw,2.5rem)]">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="방코드"
              className="pointer-events-auto relative w-full max-w-[min(52rem,94vw)]"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={FRAME_VARIANTS}
              onClick={(event) => event.stopPropagation()}
            >
              <PublicAsset
                src={ROOM_INVITE_ASSETS.inputFrame}
                alt="방코드"
                className="pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
              />

              <button
                type="button"
                aria-label="방코드 팝업 닫기"
                onClick={onClose}
                className={CLOSE_BTN_CLASS}
              >
                <PublicAsset
                  src={POPUP_CLOSE_BUTTON}
                  alt=""
                  className="block h-auto w-full select-none"
                />
              </button>

              <div
                className="absolute z-10 flex items-center justify-center"
                style={CODE_INPUT_INSET}
              >
                <RoomCodeInput
                  value={roomCode}
                  onChange={() => {}}
                  readOnly
                />
              </div>

              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end"
                style={FRAME_INSET}
              >
                <button
                  type="button"
                  aria-label={copied ? "방코드 복사됨" : "방코드 복사"}
                  onClick={handleCopy}
                  className={`pointer-events-auto mx-auto ${COPY_BTN_CLASS}`}
                >
                  <PublicAsset
                    src={ROOM_INVITE_ASSETS.joinButton}
                    alt=""
                    className="block h-auto w-full select-none"
                  />
                  <span className={COPY_BTN_LABEL_CLASS} aria-hidden="true">
                    {copied ? "복사됨" : "방코드 복사"}
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
