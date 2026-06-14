import { useNavigate } from "react-router-dom"
import { GAME_MODES, MODE_SCREEN_ASSETS } from "../constants/modeAssets.js"
import ModeOptionCard from "../components/ModeOptionCard.jsx"
import BackButton, { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/ui/BackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

export default function GameModePage() {
  const navigate = useNavigate()

  const handleModeSelect = (modeId) => {
    if (modeId === "multi") navigate("/multiplay")
    if (modeId === "secret-banquet") navigate("/roomInvite")
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
              <ModeOptionCard
                key={mode.id}
                label={mode.label}
                frame={mode.frame}
                onSelect={() => handleModeSelect(mode.id)}
              />
            ))}
          </div>
        </div>

        <BackButton
          onClick={() => navigate("/lobby")}
          className={BACK_BUTTON_PAGE_POSITION_CLASS}
        />
      </div>
    </div>
  )
}
