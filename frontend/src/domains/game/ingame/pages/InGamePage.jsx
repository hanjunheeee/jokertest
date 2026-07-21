import { useState } from "react"
import { motion } from "framer-motion"
import InGamePlayerBoard from "../components/board/InGamePlayerBoard.jsx"
import InGameChatShell from "../components/chat/InGameChatShell.jsx"
import InGameActionPanel from "../components/actions/InGameActionPanel.jsx"
import { InGamePlayerSessionProvider } from "../components/InGamePlayerSessionProvider.jsx"
import InGameTopControls from "../components/controls/InGameTopControls.jsx"
import PlayerRecordListPanel from "../components/controls/playerRecordList/PlayerRecordListPanel.jsx"
import InGameVoteStatusPanel from "../components/vote/InGameVoteStatusPanel.jsx"
import InGameTimebar from "../components/timebar/InGameTimebar.jsx"
import { INGAME_ASSETS } from "../constants/ingameAssets.js"
import { mapGamePhaseToTimebarPhaseId } from "../constants/timebar/ingameTimebarAssets.js"
import { useInGameStore } from "../store/ingameStore.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

/** 인게임 화면 전체(배경 + 컨트롤 + 타임바 + 플레이어 보드 + 채팅)를 조합하는 최상위 페이지 */
export default function InGamePage() {
  const [playerRecordListOpen, setPlayerRecordListOpen] = useState(false)
  const [voteStatusOpen, setVoteStatusOpen] = useState(false)
  const gameState = useInGameStore((s) => s.state)
  // useInGameSocket()은 백엔드 game-core/gameSession이 아직 없어서 제외 — gameState는 항상 null이라
  // 아래 컴포넌트들은 프리뷰(더미) 모드로 렌더링됩니다.

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* motion.img: framer-motion이 제공하는, 애니메이션 속성이 붙은 img 태그.
          initial(시작 상태)의 opacity 0에서 animate(도착 상태)의 opacity 1로 바뀌며
          배경 이미지가 서서히 나타나는 페이드인 효과를 만듦 */}
      <motion.img
        src={publicAsset(INGAME_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <InGameTopControls
        onMenuClick={() => setPlayerRecordListOpen(true)}
      />
      <InGamePlayerSessionProvider>
        <InGameTimebar
          day={gameState?.dayIndex}
          activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}
          onVoteStatusClick={() => setVoteStatusOpen(true)}
        />
        <InGamePlayerBoard />
        <InGameChatShell />
        <InGameActionPanel />
        <PlayerRecordListPanel
          open={playerRecordListOpen}
          onClose={() => setPlayerRecordListOpen(false)}
        />
        <InGameVoteStatusPanel
          open={voteStatusOpen}
          onClose={() => setVoteStatusOpen(false)}
        />
      </InGamePlayerSessionProvider>
    </div>
  )
}