import PlayerSlotGrid from "@/domains/game/shared/components/PlayerSlotGrid.jsx"
import {
  INGAME_PLAYER_SLOT_COLUMNS,
  INGAME_PREVIEW_PLAYER_COUNT,
} from "../../constants/ingamePlayerBoard.js"
import { pickInGameJobPortrait } from "../../utils/pickInGameJobPortrait.js"
import InGamePlayerCard from "./InGamePlayerCard.jsx"

const BOARD_POSITION_CLASS =
  "absolute top-1/2 right-[clamp(0.35rem,1.2cqw,0.85rem)] z-10 w-[clamp(37rem,76cqw,61rem)] -translate-y-1/2 [container-type:inline-size]"

const BOARD_GRID_CLASS =
  "flex flex-col items-center gap-[clamp(0.65rem,2.25cqi,1.1rem)]"

const BOARD_ROW_CLASS =
  "flex items-end justify-center gap-[clamp(0.55rem,1.85cqi,1rem)]"

/** 2행(6명 이상)일 때 카드 크기 */
const CARD_CLASS_COMPACT = "w-[clamp(6.25rem,20.2cqi,9.5rem)] shrink-0"

/** 1행(5명 이하)일 때 카드 크기 */
const CARD_CLASS_LARGE = "w-[clamp(7rem,20.5cqi,10.25rem)] shrink-0"

function buildPreviewSlots(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-slot-${index + 1}`,
    portraitSrc: pickInGameJobPortrait(index),
  }))
}

/**
 * 인게임 플레이어 카드 보드 — 5열 그리드, 최대 10명
 */
export default function InGamePlayerBoard({
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
}) {
  const slots = buildPreviewSlots(playerCount)
  const rowCount = Math.ceil(slots.length / INGAME_PLAYER_SLOT_COLUMNS)
  const cardClass = rowCount > 1 ? CARD_CLASS_COMPACT : CARD_CLASS_LARGE

  return (
    <div className={BOARD_POSITION_CLASS}>
      <PlayerSlotGrid
        slots={slots}
        columns={INGAME_PLAYER_SLOT_COLUMNS}
        className={BOARD_GRID_CLASS}
        rowClassName={BOARD_ROW_CLASS}
        renderSlot={(slot) => (
          <InGamePlayerCard
            key={slot.id}
            portraitSrc={slot.portraitSrc}
            className={cardClass}
          />
        )}
      />
    </div>
  )
}
