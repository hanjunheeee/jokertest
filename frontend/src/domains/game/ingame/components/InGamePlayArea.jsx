// 파일 역할: InGamePlayArea.jsx - 화면을 구성하는 컴포넌트입니다.
import InGamePlayerBoard from "./board/InGamePlayerBoard.jsx"
import InGameChatShell from "./chat/InGameChatShell.jsx"
import InGameActionPanel from "./actions/InGameActionPanel.jsx"
import { InGamePlayerSessionProvider } from "./InGamePlayerSessionProvider.jsx"
import InGameTimebar from "./timebar/InGameTimebar.jsx"
import { mapGamePhaseToTimebarPhaseId } from "../constants/timebar/ingameTimebarAssets.js"
import { selectInGameTimebarStatusMessage } from "../utils/selectInGameTimebarStatusMessage.js"
import { useInGameStore } from "../store/ingameStore.js"

/** 시간바·플레이어 보드·채팅·행동 패널처럼 실제 게임 진행 UI를 묶습니다. */
export default function InGamePlayArea() {
  const gameState = useInGameStore((s) => s.state)

  return (
    <InGamePlayerSessionProvider>
      <InGameTimebar
        day={gameState?.dayIndex}
        activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}
        statusMessage={selectInGameTimebarStatusMessage(gameState)}
      />
      <InGamePlayerBoard />
      <InGameChatShell />
      <InGameActionPanel />
    </InGamePlayerSessionProvider>
  )
}
