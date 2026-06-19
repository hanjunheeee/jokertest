/**
 * 멀티플레이 진입 후 세부 옵션 선택 화면 (prototype: 게임모드 선택창-멀티플레이 선택.png)
 * GameModePage에서 멀티플레이 카드를 고르면 진입합니다.
 *
 * - 뒤로가기 → /gameMode
 * - 게임 만들기 → /game-setup
 * - 게임 찾기 → 랜덤 매칭 큐 진입 → match_found 수신 → /game-matching
 *
 * UI 구성: GameModeTypeIndicator(상단 모드 표시), ModeOptionCard, SoundControl, BackButton
 * 옵션 목록·에셋은 constants/modeAssets.js의 MULTIPLAY_OPTIONS 참고
 */
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  MODE_SCREEN_ASSETS,
  MULTIPLAY_OPTIONS,
} from "../constants/modeAssets.js"
import GameModeTypeIndicator from "../components/GameModeTypeIndicator.jsx"
import ModeOptionCard from "../components/ModeOptionCard.jsx"
import BackButton from "@/shared/ui/BackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"
import { getSocket } from "@/shared/socket/socketClient"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore"

/** 멀티플레이 하위 옵션(게임 만들기·찾기) 선택·네비게이션을 담당하는 페이지 컴포넌트 */
export default function MultiplayEntryPage() {
  const navigate     = useNavigate()
  const isSearching  = useMatchingStore((s) => s.isSearching)
  const isInRoom     = useMatchingStore((s) => s.isInRoom)
  const startSearch  = useMatchingStore((s) => s.startSearch)
  const stopSearch   = useMatchingStore((s) => s.stopSearch)

  // match_found 수신 → useSocket이 isInRoom을 true로 변경 → 여기서 navigate
  useEffect(() => {
    if (isInRoom) navigate('/game-matching')
  }, [isInRoom, navigate])

  const handleOptionSelect = (optionId) => {
    if (optionId === "create") {
      navigate("/game-setup")
      return
    }
    if (optionId === "find") {
      const socket = getSocket()
      if (!socket) return
      startSearch()
      socket.emit('join_matchmaking')
    }
  }

  const handleCancelSearch = () => {
    getSocket()?.emit('leave_matchmaking')
    stopSearch()
  }

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <img
        src={publicAsset(MODE_SCREEN_ASSETS.bg)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <div className="absolute inset-0 z-10">
        <GameModeTypeIndicator />

        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
          <SoundControl />
        </div>

        <div
          className="absolute inset-x-0 top-[12%] bottom-[10%] flex items-center justify-center px-[clamp(1rem,4vw,3rem)] sm:top-[11%] sm:bottom-[9%]"
          role="group"
          aria-label="멀티플레이 옵션 선택"
        >
          <div className="flex w-full max-w-[min(52rem,88vw)] items-stretch justify-center gap-[clamp(1rem,3vw,2.5rem)]">
            {MULTIPLAY_OPTIONS.map((option) => (
              <ModeOptionCard
                key={option.id}
                label={option.label}
                frame={option.frame}
                onSelect={() => handleOptionSelect(option.id)}
              />
            ))}
          </div>
        </div>

        {/* 매칭 중 오버레이 — isSearching 동안 표시, 취소 버튼으로 큐 이탈 */}
        {isSearching && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/70">
            <p className="font-subheading text-[clamp(1.4rem,2.2vw,1.8rem)] font-bold text-[#f5f0e6] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
              매칭 중입니다...
            </p>
            <button
              type="button"
              onClick={handleCancelSearch}
              className="font-subheading text-[clamp(1rem,1.4vw,1.15rem)] font-bold text-[#c4a87a] underline underline-offset-4 transition-opacity hover:opacity-75"
            >
              취소
            </button>
          </div>
        )}

        <BackButton
          ariaLabel="게임 모드 선택으로 돌아가기"
          onClick={() => navigate("/gameMode")}
          className={BACK_BUTTON_PAGE_POSITION_CLASS}
        />
      </div>
    </div>
  )
}
