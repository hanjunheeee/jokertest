import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
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
import { useInGameExit } from "../hooks/useInGameExit.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

/** 인게임 화면 전체(배경 + 컨트롤 + 타임바 + 플레이어 보드 + 채팅)를 조합하는 최상위 페이지 */
export default function InGamePage() {
  const [playerRecordListOpen, setPlayerRecordListOpen] = useState(false)
  const [voteStatusOpen, setVoteStatusOpen] = useState(false)
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const navigate = useNavigate()
  const { requestExit } = useInGameExit()
  // useInGameSocket()은 인게임 진입 후 실시간 동기화를 담당할 훅인데 아직 없어 제외했습니다.
  // gameState는 게임 시작 시점의 정적인 초기 state(ROLE_REVEAL 단계)에 머물러 있고, 아래
  // 컴포넌트들은 그 state와 프리뷰(더미) 데이터를 섞어 렌더링합니다.

  // 게임 중 새로고침 등으로 ingameStore가 비어있는 채 /ingame에 직접 진입하면(store가
  // 초기화되어 있음) 실제 참가자 대신 더미 프리뷰 데이터로 채워진 화면이 보인다. 유효한
  // GameSession 상태가 없으면 /multiplay로 돌려보낸다 — 새로고침한 당사자는 서버가
  // 재전송해줄 game_ended도 받을 수 없어 useGameSessionSocketEvents(전역 game_ended
  // 핸들러)만으로는 이 경로를 막지 못하므로, 이 guard로 보완한다.
  const isValidGameSession = Boolean(gameId) && Boolean(gameState) && gameState.id === gameId

  useEffect(() => {
    if (isValidGameSession) return
    navigate("/multiplay", { replace: true })
  }, [isValidGameSession, navigate])

  if (!isValidGameSession) return null

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
        onExitClick={requestExit}
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