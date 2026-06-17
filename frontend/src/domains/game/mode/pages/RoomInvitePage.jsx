/**
 * 비밀연회장 방 코드 입력·참여 화면 (prototype: 방코드 입력 관련)
 * GameModePage에서 비밀연회장 카드를 고르면 진입합니다.
 *
 * - 뒤로가기 / 취소 → /gameMode
 * - 참여하기 → 미구현 (TODO: 방 참여 API 연동, 방 코드 6자일 때만 동작 예정)
 *
 * UI 구성: RoomCodeFrame(양피지 프레임·6칸 입력), LabelledActionButton(취소·참여하기),
 *          MotionBackButton(좌하단), 배경 영상
 * 에셋·스타일은 constants/roomInviteAssets.js, roomCodeFrameStyles.js 참고
 */
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import RoomCodeFrame from "../components/RoomCodeFrame.jsx"
import { ROOM_INVITE_ASSETS } from "../constants/roomInviteAssets.js"
import {
  ROOM_CODE_ACTION_BTN_CLASS,
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "../constants/roomCodeFrameStyles.js"
import {
  BACK_BUTTON_PAGE_POSITION_CLASS,
  MotionBackButton,
} from "@/shared/ui/BackButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { publicAsset } from "@/shared/utils/publicAsset.js"

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

/** 이미지 버튼 위에 텍스트 라벨을 겹쳐 그리는 액션 버튼 (취소·참여하기) */
function LabelledActionButton({ src, label, onClick, className = "", variants }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      variants={variants}
      className={`${ROOM_CODE_ACTION_BTN_CLASS} ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      <span className={ROOM_CODE_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
        {label}
      </span>
    </motion.button>
  )
}

/** 방 코드 6자리 입력 후 취소·참여를 처리하는 페이지 컴포넌트 */
export default function RoomInvitePage() {
  const navigate = useNavigate() // 화면 전환(취소·뒤로가기 → /gameMode)
  const [uiVisible, setUiVisible] = useState(false) // true가 되면 프레임·버튼 입장 연출 및 클릭 허용
  const [roomCode, setRoomCode] = useState("") // 입력 중인 방 코드(최대 6자)

  // 프레임 연출 관련 상태값 함수
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
          className="w-full max-w-[min(52rem,94vw)]"
          initial="hidden"
          animate={uiVisible ? "visible" : "hidden"}
          variants={PARCHMENT_FRAME_VARIANTS}
          style={{ pointerEvents: uiVisible ? "auto" : "none" }}
        >
          <RoomCodeFrame
            value={roomCode}
            onChange={setRoomCode}
            autoFocus={uiVisible}
            footer={
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
                    // 미구현 (TODO: 방 참여 API 연동)
                  }}
                />
              </motion.div>
            }
          />
        </motion.div>
      </div>

      <MotionBackButton
        initial="hidden"
        animate={uiVisible ? "visible" : "hidden"}
        variants={BACK_BTN_VARIANTS}
        onClick={() => navigate("/gameMode")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-20`}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      />
    </div>
  )
}
