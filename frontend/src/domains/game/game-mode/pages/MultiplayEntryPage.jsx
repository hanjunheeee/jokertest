import { useNavigate } from "react-router-dom"
import {
  MULTIPLAY_ENTRY_ASSETS,
  MULTIPLAY_OPTIONS,
} from "../constants/multiplayEntryAssets.js"
import GameModeTypeIndicator from "@/domains/game/game-mode/components/GameModeTypeIndicator.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

function MultiplayOptionCard({ option, onSelect }) {
  return (
    <button
      type="button"
      aria-label={option.label}
      onClick={() => onSelect?.(option.id)}
      className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]"
    >
      <PublicAsset
        src={option.frame}
        alt={option.label}
        className="pointer-events-none mx-auto block h-auto w-full max-w-[clamp(13rem,24vw,20.5rem)] select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      />
    </button>
  )
}

/** prototype 게임모드 선택창-멀티플레이 선택.png — GameModePage와 동일 레이아웃 */
export default function MultiplayEntryPage() {
  const navigate = useNavigate()

  const handleOptionSelect = (optionId) => {
    if (optionId === "create") {
      navigate("/game-setup")
      return
    }
    if (optionId === "find") {
      // TODO: 게임 찾기
    }
  }

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <img
        src={publicAsset(MULTIPLAY_ENTRY_ASSETS.bg)}
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
              <MultiplayOptionCard
                key={option.id}
                option={option}
                onSelect={handleOptionSelect}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          aria-label="게임 모드 선택으로 돌아가기"
          onClick={() => navigate("/gameMode")}
          className="absolute bottom-[2.5%] left-[2.5%] block w-[clamp(4.75rem,7.5vw,6.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:left-[3%]"
        >
          <PublicAsset
            src={MULTIPLAY_ENTRY_ASSETS.backButton}
            alt=""
            className="block h-auto w-full select-none"
          />
        </button>
      </div>
    </div>
  )
}
