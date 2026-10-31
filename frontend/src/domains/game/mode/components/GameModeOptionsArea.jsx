import { GAME_MODES } from "@/domains/game/mode/constants/modeAssets.js"
import ModeOptionCard from "@/domains/game/mode/components/ModeOptionCard.jsx"

export default function GameModeOptionsArea({ onModeSelect }) {
  return (
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
            title={mode.title}
            descriptionLines={mode.descriptionLines}
            frame={mode.frame}
            comingSoon={mode.comingSoon}
            onSelect={() => onModeSelect(mode.id)}
          />
        ))}
      </div>
    </div>
  )
}
