// 방 코드로 참가 화면 (/roomInvite): 위 줄(뒤로)·실패 안내 띠·방코드 입력 틀(취소·참여하기)
// app/routes/index.jsx가 사용, 입력 상태·입장 요청·결과 처리는 데스크톱 useRoomInvitePage에서 받음
import { motion } from "framer-motion"
import { PARCHMENT_FRAME_VARIANTS } from "@/domains/game/mode/constants/roomInviteAnimations.js"
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import { useRoomInvitePage } from "@/domains/game/mode/hooks/useRoomInvitePage.js"
import EntryFailureNotice from "@m/domains/game/shared/EntryFailureNotice.jsx"
import ModeBackdrop from "@m/domains/game/mode/components/common/ModeBackdrop.jsx"
import TopBar from "@m/shared/ui/top/TopBar.jsx"
import CodeActions from "@m/domains/game/mode/components/roomCode/CodeActions.jsx"
import CodeFrame from "@m/domains/game/mode/components/roomCode/CodeFrame.jsx"

// 틀 폭: 폰 세로는 화면 폭, 폰 가로는 남는 높이에 맞춤(틀 그림 759x423), 태블릿은 36rem까지
const FRAME_WIDTH_CLASS =
  "w-full max-w-[36rem] land:max-w-[calc((100svh-4.5rem)*1.79)]"

// 방 코드 입장 화면
export default function RoomInvitePage() {
  const {
    uiVisible, roomCode, setRoomCode, joinRoom, isJoining, joinError, dismissJoinError, goBackToModeSelect,
  } = useRoomInvitePage()

  return (
    <div className="relative flex min-h-full flex-col">
      <ModeBackdrop src={ROOM_INVITE_ASSETS.bg} fade />

      <div className="relative z-10 flex flex-1 flex-col">
        <TopBar onBack={goBackToModeSelect} />
        <EntryFailureNotice message={joinError} onDismiss={dismissJoinError} />

        {/* 남는 영역 가운데 + 살짝 아래 (하단 뒤로 줄·광고 여백 감안) */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 pb-[calc(2.25rem+env(safe-area-inset-bottom,0px))] pt-0">
          <motion.div
            className={`${FRAME_WIDTH_CLASS} translate-y-[clamp(0.75rem,4.5vh,2.25rem)]`}
            initial="hidden"
            animate={uiVisible ? "visible" : "hidden"}
            variants={PARCHMENT_FRAME_VARIANTS}
            style={{ pointerEvents: uiVisible ? "auto" : "none" }}
          >
            <CodeFrame
              value={roomCode}
              onChange={setRoomCode}
              onSubmit={joinRoom}
              autoFocus={uiVisible}
              footer={<CodeActions onCancel={goBackToModeSelect} onJoin={joinRoom} isJoining={isJoining} />}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
