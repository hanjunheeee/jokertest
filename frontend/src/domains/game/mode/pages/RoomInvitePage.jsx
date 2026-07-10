/**
 * 비밀연회장 방 코드 입력·참여 화면.
 *
 * page 계층은 컴포넌트 조합과 네비게이션 제어만 담당합니다.
 * - 애니메이션 variants → roomInviteAnimations.js
 * - 버튼 UI → LabelledActionButton
 * - 방 코드 입력 → RoomCodeFrame > RoomCodeInput (내부적으로 useRoomCodeInput 사용)
 *
 * uiVisible: requestAnimationFrame 다음 프레임에서 true로 전환하여
 *   마운트 직후 "hidden → visible" 애니메이션이 부드럽게 시작되도록 합니다.
 */
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import RoomCodeFrame from "../components/RoomCodeFrame.jsx"
import LabelledActionButton from "../components/LabelledActionButton.jsx"
import { ROOM_INVITE_ASSETS } from "../constants/roomInviteAssets.js"
import {
  PARCHMENT_FRAME_VARIANTS,
  BUTTON_ROW_VARIANTS,
  BUTTON_VARIANTS,
  BACK_BTN_VARIANTS,
} from "../constants/roomInviteAnimations.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

export default function RoomInvitePage() {
  const navigate = useNavigate()
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환합니다.
  // 값을 바꾸는 함수를 호출하면 컴포넌트가 다시 렌더링되어 최신 값이 화면에 반영됩니다.
  const [uiVisible, setUiVisible] = useState(false) // true가 되면 프레임·버튼 입장 애니메이션 시작
  const [roomCode, setRoomCode] = useState("") // 입력 중인 방 코드 (최대 6자)

  // useEffect(콜백, 의존성 배열)는 렌더링 이후 실행되는 부수효과를 등록합니다.
  // 의존성 배열이 []이면 마운트 시 한 번만 실행되고, 콜백이 반환한 함수는
  // 언마운트 시 cleanup으로 호출됩니다.
  // 다음 프레임에서 uiVisible을 true로 전환 — 마운트 직후 즉시 전환 시 transition이 무시됨
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    // cleanup: 컴포넌트가 언마운트되기 전에 아직 실행되지 않은 예약된 프레임 콜백을 취소
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const handleRoomJoined = (payload) => {
      useMatchingStore.getState().setRoom(payload)
      navigate("/game-matching")
    }
    const handleRoomJoinFailed = ({ message }) => {
      alert(message ?? "방에 참여할 수 없습니다.")
    }

    socket.on("room_joined", handleRoomJoined)
    socket.on("room_join_failed", handleRoomJoinFailed)

    return () => {
      socket.off("room_joined", handleRoomJoined)
      socket.off("room_join_failed", handleRoomJoinFailed)
    }
  }, [navigate])

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
        {/* uiVisible 기준으로 PARCHMENT_FRAME_VARIANTS가 hidden → visible 전환 */}
        <motion.div
          className="w-full max-w-[min(52rem,94vw)]"
          initial="hidden"
          animate={uiVisible ? "visible" : "hidden"}
          variants={PARCHMENT_FRAME_VARIANTS}
          style={{ pointerEvents: uiVisible ? "auto" : "none" }} // 애니메이션 중 클릭 차단
        >
          <RoomCodeFrame
            value={roomCode}
            onChange={setRoomCode} // 입력값을 roomCode state에 반영
            autoFocus={uiVisible} // 입장 애니메이션이 시작된 후에 포커스 (RoomCodeInput 내 280ms 지연)
            footer={
              <motion.div
                variants={BUTTON_ROW_VARIANTS}
                className="pointer-events-auto mx-auto flex w-full max-w-[76%] items-center justify-center gap-[clamp(0.75rem,1.75vw,1.125rem)]"
              >
                <LabelledActionButton
                  src={ROOM_INVITE_ASSETS.cancelButton}
                  label="취소"
                  variants={BUTTON_VARIANTS}
                  onClick={() => navigate("/gameMode")} // 취소 → 게임 모드 선택으로 복귀
                />
                <LabelledActionButton
                  src={ROOM_INVITE_ASSETS.joinButton}
                  label="참여하기"
                  variants={BUTTON_VARIANTS}
                  onClick={() => {
                    if (roomCode.length < 6) return // 6자리 미만이면 참여 불가
                    getSocket()?.emit("join_room_by_code", { roomCode })
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
