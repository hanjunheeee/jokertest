// 모드 카드 묶음 (랜덤 매칭·방 찾기·비밀연회장)
// GameModePage가 씀, 세로 3장·스크롤 없음(겹침), x축 비대칭 — 크기·겹침은 index.css .mode-card-stack
import { GAME_MODES } from "@/domains/game/mode/constants/modeAssets.js"
import ModeCard from "@m/domains/game/mode/components/modeSelect/ModeCard.jsx"

// 위→아래: 오른쪽·왼쪽·오른쪽 — 아래 카드 z-index가 더 큼
const CARD_STAGGER_CLASS = [
  "z-10 self-end mr-[clamp(0.25rem,6vw,2rem)]",
  "z-20 -translate-y-[clamp(0.5rem,2.1vh,1rem)] self-start ml-[clamp(0.2rem,3.5vw,1.1rem)]",
  "z-30 -translate-y-[clamp(4.15rem,12.5vh,5.55rem)] self-end mr-[clamp(0.35rem,4.5vw,1.35rem)]",
]

// 모드 카드 묶음 (누르면 모드 id를 onModeSelect로 넘김)
export default function ModeCardList({ onModeSelect }) {
  return (
    <div
      className="mode-card-stack flex min-h-0 flex-1 flex-col items-stretch justify-start px-3 pb-2 pt-0"
      role="group"
      aria-label="게임 모드 선택"
    >
      {GAME_MODES.map((mode, index) => (
        <ModeCard
          key={mode.id}
          mode={mode}
          onSelect={() => onModeSelect(mode.id)}
          className={CARD_STAGGER_CLASS[index] ?? ""}
        />
      ))}
    </div>
  )
}
