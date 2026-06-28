import PlayerSlotGrid from "@/domains/game/shared/components/PlayerSlotGrid.jsx"
import {
  INGAME_PLAYER_BOARD_GRID_CLASS,
  INGAME_PLAYER_BOARD_POSITION_CLASS,
  INGAME_PLAYER_BOARD_ROW_CLASS,
  INGAME_PLAYER_CARD_CLASS_COMPACT,
  INGAME_PLAYER_CARD_CLASS_LARGE,
  INGAME_PLAYER_SLOT_COLUMNS,
  INGAME_PREVIEW_PLAYER_COUNT,
} from "../../constants/ingamePlayerBoard.js"
import { pickInGameJobPortrait } from "../../utils/pickInGameJobPortrait.js"
import InGamePlayerCard from "./InGamePlayerCard.jsx"

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
  const cardClass =
    rowCount > 1 ? INGAME_PLAYER_CARD_CLASS_COMPACT : INGAME_PLAYER_CARD_CLASS_LARGE

  return (
    <div className={INGAME_PLAYER_BOARD_POSITION_CLASS}>
      <PlayerSlotGrid
        slots={slots}
        columns={INGAME_PLAYER_SLOT_COLUMNS}
        className={INGAME_PLAYER_BOARD_GRID_CLASS}
        rowClassName={INGAME_PLAYER_BOARD_ROW_CLASS}
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
