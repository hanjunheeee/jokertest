import { useNavigate } from "react-router-dom"
import MatchingSearchOverlay from "@/domains/game/matching/components/MatchingSearchOverlay.jsx"
import GameModeOptionsArea from "@/domains/game/mode/components/GameModeOptionsArea.jsx"
import ModeBackground from "@/domains/game/mode/components/ModeBackground.jsx"
import ModePageControls from "@/domains/game/mode/components/ModePageControls.jsx"
import { useMatchmakingSearch } from "@/domains/game/mode/hooks/useMatchmakingSearch.js"

// 게임 모드를 선택하는 페이지입니다.
export default function GameModePage() {
  // 페이지 이동에 사용하는 React Router 함수입니다.
  const navigate = useNavigate()

  // 빠른 매칭의 검색 상태와 시작·취소 함수를 가져옵니다.
  const { isSearching, startQuickMatch, cancelQuickMatch } = useMatchmakingSearch()

  // 선택한 카드의 모드 id에 따라 매칭을 시작하거나 다음 페이지로 이동합니다.
  const handleModeSelect = (modeId) => {
    // 랜덤 매칭은 별도 페이지로 이동하지 않고 즉시 매칭 검색을 시작합니다.
    if (modeId === "single") {
      startQuickMatch()
      return
    }

    // 방 찾기 화면으로 이동합니다.
    if (modeId === "multi") navigate("/multiplay")

    // 방 코드를 입력해 참여하는 비밀연회장 화면으로 이동합니다.
    if (modeId === "secret-banquet") navigate("/roomInvite")
  }

  return (
    // 화면 전체를 차지하며, 영역 밖으로 나간 배경과 UI는 숨깁니다.
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* 게임 모드 선택 화면의 배경을 표시합니다. */}
      <ModeBackground />

      {/* 배경 위에 카드, 매칭 창, 페이지 조작 버튼을 배치합니다. */}
      <div className="absolute inset-0 z-10">
        {/* 선택한 카드의 id를 handleModeSelect에 전달합니다. */}
        <GameModeOptionsArea onModeSelect={handleModeSelect} />

        {/* 매칭 검색 중일 때만 나타나며 취소 버튼으로 검색을 중단합니다. */}
        <MatchingSearchOverlay open={isSearching} onCancel={cancelQuickMatch} />

        {/* 뒤로가기 버튼을 누르면 로비로 이동합니다. */}
        <ModePageControls onBack={() => navigate("/lobby")} />
      </div>
    </div>
  )
}
