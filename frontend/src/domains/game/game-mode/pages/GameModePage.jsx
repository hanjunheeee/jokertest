import { useNavigate } from "react-router-dom"
import { GAME_MODE_ASSETS, GAME_MODES } from "../constants/gameModeAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

function GameModeCard({ mode, onSelect }) {
  return (
    <button
      type="button"
      aria-label={mode.label}
      onClick={() => onSelect?.(mode.id)}
      className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]"
    >
      <PublicAsset
        src={mode.frame}
        alt={mode.label}
        className="pointer-events-none mx-auto block h-auto w-full max-w-[clamp(13rem,24vw,20.5rem)] select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      />
    </button>
  )
}

export default function GameModePage() {
  const navigate = useNavigate()

  const handleModeSelect = (modeId) => {
    if (modeId === "multi") navigate("/multiplay")
    if (modeId === "secret-banquet") navigate("/roomInvite")
  }

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <img
        src={publicAsset(GAME_MODE_ASSETS.bg)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <div className="absolute inset-0 z-10">
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
          <SoundControl />
        </div>

        <div
          className="absolute inset-x-0 top-[12%] bottom-[10%] flex items-center justify-center px-[clamp(1rem,4vw,3rem)] sm:top-[11%] sm:bottom-[9%]"
          role="group"
          aria-label="게임 모드 선택"
        >
          <div className="flex w-full max-w-[min(80rem,94vw)] items-stretch justify-center gap-[clamp(1.5rem,4.5vw,3.5rem)]">
            {GAME_MODES.map((mode) => (
              <GameModeCard
                key={mode.id}
                mode={mode}
                onSelect={handleModeSelect}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => navigate("/lobby")}
          className="absolute bottom-[2.5%] left-[2.5%] block w-[clamp(4.75rem,7.5vw,6.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:left-[3%]"
        >
          <PublicAsset
            src={GAME_MODE_ASSETS.backButton}
            alt=""
            className="block h-auto w-full select-none"
          />
        </button>
      </div>
    </div>
  )
}
