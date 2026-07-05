import {
  INGAME_PLAYER_BOARD_POSITION_CLASS,
  INGAME_PREVIEW_PLAYER_COUNT,
  buildInGamePlayerSlotStyle,
  getInGamePlayerSlotPresets,
} from "../../constants/ingamePlayerBoard.js"
import { getPreviewPlayerStatus } from "../../constants/ingamePlayerStatus.js"
import { pickInGameJobPortrait } from "../../utils/pickInGameJobPortrait.js"
import InGamePlayerCard from "./InGamePlayerCard.jsx"

/** count만큼 더미 슬롯 배열 생성 — 슬롯마다 고유 id와 순환 배정된 직업 초상을 붙임 */
function buildPreviewSlots(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-slot-${index + 1}`,
    nickname: `플레이어 ${index + 1}`,
    portraitSrc: pickInGameJobPortrait(index),
    status: getPreviewPlayerStatus(index),
  }))
}

/**
 * 인게임 플레이어 보드 — G센세 prototype 10인 링 배치
 */
export default function InGamePlayerBoard({
  // playerCount: 보드에 표시할 플레이어(카드) 수. 기본값은 미리보기용 상수
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
}) {
  const slots = buildPreviewSlots(playerCount)
  const presets = getInGamePlayerSlotPresets(playerCount)

  return (
    <div className={INGAME_PLAYER_BOARD_POSITION_CLASS}>
      {slots.map((slot, index) => (
        <div
          key={slot.id}
          className="absolute pointer-events-auto"
          style={buildInGamePlayerSlotStyle(presets[index])}
        >
          <InGamePlayerCard
            portraitSrc={slot.portraitSrc}
            nickname={slot.nickname}
            status={slot.status}
            className="w-full"
          />
        </div>
      ))}
    </div>
  )
}
