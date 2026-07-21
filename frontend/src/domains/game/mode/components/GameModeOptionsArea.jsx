// 파일 역할: GameModeOptionsArea.jsx - 화면을 구성하는 컴포넌트입니다.
import { GAME_MODES } from "@/domains/game/mode/constants/modeAssets.js"
import ModeOptionCard from "@/domains/game/mode/components/ModeOptionCard.jsx"

/** 싱글/멀티/비밀 연회장 모드 카드를 배치합니다. */
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
