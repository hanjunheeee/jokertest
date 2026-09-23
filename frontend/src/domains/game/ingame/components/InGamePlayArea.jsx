// 파일 역할: InGamePlayArea.jsx - 화면을 구성하는 컴포넌트입니다.
import InGamePlayerBoard from "./board/InGamePlayerBoard.jsx"
import InGameChatShell from "./chat/InGameChatShell.jsx"
import InGameActionPanel from "./actions/InGameActionPanel.jsx"
import { InGamePlayerSessionProvider } from "./InGamePlayerSessionProvider.jsx"
import InGameTimebar from "./timebar/InGameTimebar.jsx"
import { mapGamePhaseToTimebarPhaseId } from "../constants/timebar/ingameTimebarAssets.js"
import { useInGameStore } from "../store/ingameStore.js"
import { InGameActionProvider } from "../pages/InGamePage.jsx"

/** 시간바·플레이어 보드·채팅·행동 패널처럼 실제 게임 진행 UI를 묶습니다. */
export default function InGamePlayArea() {
  const gameState = useInGameStore((s) => s.state)

  return (
    <InGamePlayerSessionProvider>
      {/* V-1: 이 묶음도 보드와 행동 패널을 함께 마운트하는 실제 소비 경로다 — 조작 훅
          Provider가 없으면 두 자식이 보는 컨텍스트 값이 null이 된다. 이 파일에는
          오버레이 차단 상태가 없으므로 기본값 false를 리터럴로 명시한다. */}
      <InGameActionProvider interactionBlocked={false}>
        <InGameTimebar
          day={gameState?.dayIndex}
          activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}
        />
        <InGamePlayerBoard />
        <InGameChatShell />
        <InGameActionPanel />
      </InGameActionProvider>
    </InGamePlayerSessionProvider>
  )
}
