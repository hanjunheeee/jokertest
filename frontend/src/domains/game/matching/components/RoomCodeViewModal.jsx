/**
 * 방코드 읽기 전용 모달 — RoomInvitePage RoomCodeFrame 재사용
 * GameMatchingPage에서 "방코드 보기" 시 표시
 *
 * props
 * - open: 모달 표시 여부
 * - onClose: 배경·닫기 버튼 클릭 시 호출
 * - roomCode: 표시·복사할 6자리 방 코드 문자열
 *
 * 복사는 navigator.clipboard 사용, 입력은 readOnly (onChange 무시)
 * 닫기·복사 버튼 스타일은 constants/matchingPopupStyles.js, 프레임은 game/mode 참고
 */
import { AnimatePresence, motion } from "framer-motion"
import { useRef, useState } from "react"
import RoomCodeFrame from "@/domains/game/mode/components/RoomCodeFrame.jsx"
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import {
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "@/domains/game/mode/constants/roomCodeFrameStyles.js"
import {
  MATCHING_BTN_SCALE_WRAP_CLASS,
  MATCHING_BTN_IMG_SCALE_CLASS,
  MATCHING_MODAL_CLOSE_BTN_CLASS,
} from "../constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const MODAL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

const POPUP_CLOSE_BUTTON = "/button/팝업 닫기 버튼.png"

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

/** 방코드 6칸 읽기 전용 프레임 + 복사·닫기가 있는 오버레이 모달 */
export default function RoomCodeViewModal({ open, onClose, roomCode }) {
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅으로,
  // 값을 바꾸는 함수를 호출하면 컴포넌트가 다시 렌더링됩니다.
  // copied: 클립보드 복사 성공 여부. true인 동안 복사 버튼 라벨이 "복사됨"으로 바뀜
  const [copied, setCopied] = useState(false) // true면 복사 버튼 라벨 "복사됨" 표시
  // useRef(초기값)은 값을 담는 상자({ current })를 반환하는 훅입니다.
  // useState와 달리 값이 바뀌어도 리렌더링을 일으키지 않고, 렌더링 사이에도
  // 값이 그대로 유지됩니다. 여기서는 setTimeout의 id를 저장해 뒀다가
  // 재복사·모달 닫기 시 이전 타이머를 취소하는 용도로 사용합니다.
  const copyFeedbackTimerRef = useRef(null)

  /** 모달 닫기 시 복사 피드백과 예약된 타이머를 함께 정리합니다. */
  const handleClose = () => {
    if (copyFeedbackTimerRef.current) {
      window.clearTimeout(copyFeedbackTimerRef.current)
      copyFeedbackTimerRef.current = null
    }
    setCopied(false)
    onClose()
  }

  /** 클립보드에 roomCode 복사 후 2초간 copied 표시 */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current)
      }
      setCopied(true)
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        copyFeedbackTimerRef.current = null
      }, 2000)
    } catch {
      setCopied(false) // 권한 거부·비보안 컨텍스트 등
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
                value={roomCode}
                onChange={() => {}} // readOnly — 입력 변경 없음
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
                  <button
                    type="button"
                    aria-label={copied ? "방코드 복사됨" : "방코드 복사"}
                    onClick={handleCopy}
                    className="group pointer-events-auto mx-auto w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"
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
                }
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
