import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ROOM_INVITE_ASSETS } from "../assets/roomInviteAssets.js"
import PublicAsset from "../components/login/PublicAsset.jsx"
import RoomCodeInput from "../components/roomInvite/RoomCodeInput.jsx"
import { publicAsset } from "../lib/publicAsset.js"

const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }

/** 양피지 프레임이 위에서 살짝 기울어진 채 내려앉는 연출 */
const PARCHMENT_FRAME_VARIANTS = {
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
      when: "beforeChildren",
      delayChildren: 0.22,
    },
  },
}

const BUTTON_ROW_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
    },
  },
}

const BUTTON_VARIANTS = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

const BACK_BTN_VARIANTS = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.38 },
  },
}

/** prototype 방코드 입력창.png — 프레임 내부 버튼 영역 */
const FRAME_INSET = {
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
  paddingBottom: "7.5%",
}

/** 프레임 PNG에 그려진 6칸 입력 슬롯 위치 (prototype 방코드 입력 프레임.png) */
const CODE_INPUT_INSET = {
  top: "48.4%",
  left: "10.6%",
  right: "12.6%",
  height: "12.8%",
}

const ACTION_BTN_CLASS =
  "relative w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

const ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(1.05rem,1.55vw,1.3rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

function LabelledActionButton({ src, label, onClick, className = "", variants }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      variants={variants}
      className={`${ACTION_BTN_CLASS} ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      <span className={ACTION_BTN_LABEL_CLASS} aria-hidden="true">
        {label}
      </span>
    </motion.button>
  )
}

export default function RoomInvitePage() {
  const navigate = useNavigate()
  const [uiVisible, setUiVisible] = useState(false)
  const [roomCode, setRoomCode] = useState("")

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(ROOM_INVITE_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <div className="absolute inset-0 z-10 flex items-center justify-center px-[clamp(1rem,4vw,2.5rem)]">
        <motion.div
          className="relative w-full max-w-[min(52rem,94vw)]"
          initial="hidden"
          animate={uiVisible ? "visible" : "hidden"}
          variants={PARCHMENT_FRAME_VARIANTS}
          style={{ pointerEvents: uiVisible ? "auto" : "none" }}
        >
          <PublicAsset
            src={ROOM_INVITE_ASSETS.inputFrame}
            alt="방코드 입력"
            className="pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          />

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end"
            style={FRAME_INSET}
          >
            <motion.div
              variants={BUTTON_ROW_VARIANTS}
              className="pointer-events-auto mx-auto flex w-full max-w-[76%] items-center justify-center gap-[clamp(0.75rem,1.75vw,1.125rem)]"
            >
              <LabelledActionButton
                src={ROOM_INVITE_ASSETS.cancelButton}
                label="취소"
                variants={BUTTON_VARIANTS}
                onClick={() => navigate("/gameMode")}
              />
              <LabelledActionButton
                src={ROOM_INVITE_ASSETS.joinButton}
                label="참여하기"
                variants={BUTTON_VARIANTS}
                onClick={() => {
                  if (roomCode.length < 6) return
                  // TODO: 방 참여 API 연동
                }}
              />
            </motion.div>
          </div>

          <div
            className="absolute z-10 flex items-center justify-center"
            style={CODE_INPUT_INSET}
          >
            <RoomCodeInput
              value={roomCode}
              onChange={setRoomCode}
              autoFocus={uiVisible}
            />
          </div>
        </motion.div>
      </div>

      <motion.button
        type="button"
        aria-label="뒤로 가기"
        initial="hidden"
        animate={uiVisible ? "visible" : "hidden"}
        variants={BACK_BTN_VARIANTS}
        onClick={() => navigate("/gameMode")}
        className="absolute bottom-[2.5%] left-[2.5%] z-20 block w-[clamp(4.75rem,7.5vw,6.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:left-[3%]"
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      >
        <PublicAsset
          src={ROOM_INVITE_ASSETS.backButton}
          alt=""
          className="block h-auto w-full select-none"
        />
      </motion.button>
    </div>
  )
}
