// 방 코드로 참가 화면 (/roomInvite): 위 줄(뒤로) + 방코드 입력 틀 + 바닥 취소·참여하기
// app/routes/index.jsx가 씀, 입력 상태·입장 요청·결과 처리는 데스크톱 useRoomInvitePage 그대로
import { motion } from "framer-motion"
import { PARCHMENT_FRAME_VARIANTS } from "@/domains/game/mode/constants/roomInviteAnimations.js"
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import { useRoomInvitePage } from "@/domains/game/mode/hooks/useRoomInvitePage.js"
import ModeBackdrop from "@m/domains/game/mode/components/common/ModeBackdrop.jsx"
import TopBar from "@m/domains/game/mode/components/common/TopBar.jsx"
import CodeActions from "@m/domains/game/mode/components/roomCode/CodeActions.jsx"
import CodeFrame from "@m/domains/game/mode/components/roomCode/CodeFrame.jsx"

// 틀 폭: 폰 세로는 화면 폭, 폰 가로는 남는 높이에 맞춤(틀 그림 759x423), 태블릿은 36rem까지
const FRAME_WIDTH_CLASS =
  "w-full max-w-[36rem] land:max-w-[calc((100svh-8.5rem)*1.79)]"

// 방 코드 화면
export default function RoomInvitePage() {
  const { uiVisible, roomCode, setRoomCode, joinRoom, goBackToModeSelect } = useRoomInvitePage()

  return (
    <div className="relative flex min-h-full flex-col">
      <ModeBackdrop src={ROOM_INVITE_ASSETS.bg} />

      <div className="relative z-10 flex flex-1 flex-col">
        <TopBar onBack={goBackToModeSelect} backAriaLabel="게임 모드 선택으로 돌아가기" />

        {/* 키보드가 올라와도 틀이 보이게 위쪽 가까이 둠 */}
        <div className="flex flex-1 flex-col items-center justify-start px-3 pb-4 pt-[8svh] land:justify-center land:pt-0 md:justify-center md:pt-0">
          <motion.div
            className={FRAME_WIDTH_CLASS}
            initial="hidden"
            animate={uiVisible ? "visible" : "hidden"}
            variants={PARCHMENT_FRAME_VARIANTS}
            style={{ pointerEvents: uiVisible ? "auto" : "none" }}
          >
            <CodeFrame value={roomCode} onChange={setRoomCode} onSubmit={joinRoom} autoFocus={uiVisible} />
          </motion.div>

          {/* 틀 그림 속 안내 글이 폰 폭에선 작아서 한 줄 더 */}
          <p className="mt-3 text-center font-subheading app-text-scaled [--app-text-size:0.9rem] font-semibold !text-[#e8d5a8] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)] land:hidden">
            친구에게 받은 방 코드 6자리를 입력하세요.
          </p>
        </div>
      </div>

      <CodeActions onCancel={goBackToModeSelect} onJoin={joinRoom} />
    </div>
  )
}
