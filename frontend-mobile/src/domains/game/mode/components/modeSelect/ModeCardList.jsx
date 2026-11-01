// 모드 카드 묶음 (랜덤 매칭·방 찾기·비밀연회장)
// GameModePage가 씀, 폰 세로는 세로로 쌓고 폰 가로·태블릿은 한 줄로
import { GAME_MODES } from "@/domains/game/mode/constants/modeAssets.js"
import ModeCard from "@m/domains/game/mode/components/modeSelect/ModeCard.jsx"

// 카드 폭: 세로 폰은 화면 폭 기준, 가로 폰은 남는 높이에 맞춤(카드 그림 308x578), 태블릿은 3장이 한 줄에
const CARD_WIDTH_CLASS =
  "w-[min(68vw,17rem)] land:w-[min(30vw,calc((100svh-5.5rem)*0.533))] md:w-[min(28vw,16rem)] lg:w-[min(26vw,18rem)]"

// 모드 카드 묶음 (누르면 모드 id를 onModeSelect로 넘김)
export default function ModeCardList({ onModeSelect }) {
  return (
    <div
      className="flex flex-col items-center gap-5 px-4 pb-8 pt-2 land:flex-row land:justify-center land:gap-4 land:pb-4 land:pt-0 md:flex-row md:justify-center md:gap-6"
      role="group"
      aria-label="게임 모드 선택"
    >
      {GAME_MODES.map((mode) => (
        <ModeCard
          key={mode.id}
          mode={mode}
          onSelect={() => onModeSelect(mode.id)}
          className={CARD_WIDTH_CLASS}
        />
      ))}
    </div>
  )
}
