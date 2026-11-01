// 모드 선택 화면 (/gameMode): 위 줄(뒤로·소리) + 모드 카드 + 빠른 매칭 덮개
// app/routes/index.jsx가 씀, 동작은 데스크톱 GameModePage와 같음 (랜덤 매칭은 준비중 잠금)
import { useNavigate } from "react-router-dom"
import { useMatchmakingSearch } from "@/domains/game/mode/hooks/useMatchmakingSearch.js"
import ModeBackdrop from "@m/domains/game/mode/components/common/ModeBackdrop.jsx"
import SoundMenu from "@m/shared/ui/sound/SoundMenu.jsx"
import TopBar from "@m/shared/ui/top/TopBar.jsx"
import ModeCardList from "@m/domains/game/mode/components/modeSelect/ModeCardList.jsx"
import SearchOverlay from "@m/domains/game/mode/components/modeSelect/SearchOverlay.jsx"

// 모드 선택 화면
export default function GameModePage() {
  const navigate = useNavigate()
  const { isSearching, startQuickMatch, cancelQuickMatch } = useMatchmakingSearch()

  // 랜덤 매칭은 빠른 매칭 시작, 방 찾기는 /multiplay, 비밀연회장은 /roomInvite
  const handleModeSelect = (modeId) => {
    if (modeId === "single") {
      startQuickMatch()
      return
    }
    if (modeId === "multi") navigate("/multiplay")
    if (modeId === "secret-banquet") navigate("/roomInvite")
  }

  return (
    <div className="relative flex min-h-full flex-col">
      <ModeBackdrop />

      <div className="relative z-10 flex flex-1 flex-col">
        <TopBar onBack={() => navigate("/lobby")} right={<SoundMenu look="mode" />} />

        {/* 남는 높이 가운데에 카드 (카드가 길면 그냥 스크롤) */}
        <div className="flex flex-1 flex-col justify-center">
          <ModeCardList onModeSelect={handleModeSelect} />
        </div>
      </div>

      <SearchOverlay open={isSearching} onCancel={cancelQuickMatch} />
    </div>
  )
}
