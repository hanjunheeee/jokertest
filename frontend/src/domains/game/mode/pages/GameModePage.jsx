import { useNavigate } from "react-router-dom"
import MatchingSearchOverlay from "@/domains/game/matching/components/MatchingSearchOverlay.jsx"
import GameModeOptionsArea from "@/domains/game/mode/components/GameModeOptionsArea.jsx"
import ModeBackground from "@/domains/game/mode/components/ModeBackground.jsx"
import ModePageControls from "@/domains/game/mode/components/ModePageControls.jsx"
import { useMatchmakingSearch } from "@/domains/game/mode/hooks/useMatchmakingSearch.js"

export default function GameModePage() {
  const navigate = useNavigate()

  const { isSearching, startQuickMatch, cancelQuickMatch } = useMatchmakingSearch()

  const handleModeSelect = (modeId) => {
    if (modeId === "single") {
      startQuickMatch()
      return
    }

    if (modeId === "multi") navigate("/multiplay")

    if (modeId === "secret-banquet") navigate("/roomInvite")
  }

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <ModeBackground />

      <div className="absolute inset-0 z-10">
        <GameModeOptionsArea onModeSelect={handleModeSelect} />

        <MatchingSearchOverlay open={isSearching} onCancel={cancelQuickMatch} />

        <ModePageControls onBack={() => navigate("/lobby")} />
      </div>
    </div>
  )
}
