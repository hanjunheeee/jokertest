import InGamePlayerBoard from "./board/InGamePlayerBoard.jsx"
import InGameChatShell from "./chat/InGameChatShell.jsx"
import { InGamePlayerSessionProvider } from "./InGamePlayerSessionProvider.jsx"
import InGameTimebar from "./timebar/InGameTimebar.jsx"
import { mapGamePhaseToTimebarPhaseId } from "../constants/timebar/ingameTimebarAssets.js"
import { useInGameStore } from "../store/ingameStore.js"
import { InGameActionProvider } from "../pages/InGamePage.jsx"

export default function InGamePlayArea() {
  const gameState = useInGameStore((s) => s.state)

  return (
    <InGamePlayerSessionProvider>
      <InGameActionProvider interactionBlocked={false}>
        <InGameTimebar
          day={gameState?.dayIndex}
          activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}
        />
        <InGamePlayerBoard />
        <InGameChatShell />
      </InGameActionProvider>
    </InGamePlayerSessionProvider>
  )
}
