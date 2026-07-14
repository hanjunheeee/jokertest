// 파일 역할: RoomInvitePage.jsx - 라우터에서 렌더링되는 페이지입니다.
import { motion } from "framer-motion"
import LabelledActionButton from "@/domains/game/mode/components/LabelledActionButton.jsx"
import RoomCodeFrame from "@/domains/game/mode/components/RoomCodeFrame.jsx"
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import {
  BACK_BTN_VARIANTS,
  BUTTON_ROW_VARIANTS,
  BUTTON_VARIANTS,
  PARCHMENT_FRAME_VARIANTS,
} from "@/domains/game/mode/constants/roomInviteAnimations.js"
import { useRoomInvitePage } from "@/domains/game/mode/hooks/useRoomInvitePage.js"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 방코드를 입력해서 비밀 연회장에 참여하는 페이지입니다.
export default function RoomInvitePage() {
  const { uiVisible, roomCode, setRoomCode, joinRoom, goBackToModeSelect } = useRoomInvitePage()

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
                  onClick={goBackToModeSelect}
                />
                <LabelledActionButton
                  src={ROOM_INVITE_ASSETS.joinButton}
                  label="참여하기"
                  variants={BUTTON_VARIANTS}
                  onClick={joinRoom}
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
        onClick={goBackToModeSelect}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-20`}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      />
    </div>
  )
}
