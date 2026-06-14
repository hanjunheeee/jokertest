import { useNavigate } from "react-router-dom"
import {
  MODE_SCREEN_ASSETS,
  MULTIPLAY_OPTIONS,
} from "../constants/modeAssets.js"
import GameModeTypeIndicator from "../components/GameModeTypeIndicator.jsx"
import ModeOptionCard from "../components/ModeOptionCard.jsx"
import BackButton, { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/ui/BackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

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

        <BackButton
          ariaLabel="게임 모드 선택으로 돌아가기"
          onClick={() => navigate("/gameMode")}
          className={BACK_BUTTON_PAGE_POSITION_CLASS}
        />
      </div>
    </div>
  )
}
