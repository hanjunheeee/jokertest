// 모드 선택 화면: 배경·모드 카드·빠른 매칭 덮개·구석 조작, 들어올 때 남은 판·대기방 자리 정리
// /gameMode 라우트가 씀
import { useNavigate } from "react-router-dom"
import MatchingSearchOverlay from "@/domains/game/matching/components/MatchingSearchOverlay.jsx"
import GameModeOptionsArea from "@/domains/game/mode/components/GameModeOptionsArea.jsx"
import ModeBackground from "@/domains/game/mode/components/ModeBackground.jsx"
import ModePageControls from "@/domains/game/mode/components/ModePageControls.jsx"
import { useMatchmakingSearch } from "@/domains/game/mode/hooks/useMatchmakingSearch.js"
import { useLobbyEntryCleanup } from "@/domains/game/shared/hooks/useLobbyEntryCleanup.js"

// 모드 선택 화면
export default function GameModePage() {
  const navigate = useNavigate()
  // 들어올 때 서버가 남은 판·대기방 자리를 지움 (판 중 산 사람이면 판 화면으로)
  useLobbyEntryCleanup()

  const { isSearching, startQuickMatch, cancelQuickMatch } = useMatchmakingSearch()

  // 모드 고르면: 랜덤 매칭은 빠른 매칭 시작, 방 찾기는 /multiplay, 비밀연회장은 /roomInvite
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

        {/* 뒤로 가면 로비 */}
        <ModePageControls onBack={() => navigate("/lobby")} />
      </div>
    </div>
  )
}
