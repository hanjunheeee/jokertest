import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import {
  MATCHING_SLOT_CLASS_COMPACT,
  MATCHING_SLOT_CLASS_LARGE,
  MATCHING_SLOT_NOT_READY_OFFSET_CLASS,
  MATCHING_SLOTS_GRID_CLASS,
  MATCHING_SLOTS_ROW_CLASS,
} from "../constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export const MATCHING_SLOT_COLUMNS = 5

function chunkSlots(slots, columns = MATCHING_SLOT_COLUMNS) {
  const rows = []
  for (let i = 0; i < slots.length; i += columns) {
    rows.push(slots.slice(i, i + columns))
  }
  return rows
}

export default function MatchingPartySlots({ slots = [] }) {
  const rows = chunkSlots(slots)
  const rowCount = rows.length || 1
  const slotClass =
    rowCount > 1 ? MATCHING_SLOT_CLASS_COMPACT : MATCHING_SLOT_CLASS_LARGE

  return (
    <div className={MATCHING_SLOTS_GRID_CLASS} data-matching-slots>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className={MATCHING_SLOTS_ROW_CLASS}>
          {row.map((slot) => (
            <PublicAsset
              key={slot.id}
              src={
                slot.ready
                  ? GAME_MATCHING_ASSETS.silhouetteReady
                  : GAME_MATCHING_ASSETS.silhouetteNotReady
              }
              alt={slot.ready ? "준비 완료" : "준비 중"}
              className={`${slotClass}${slot.ready ? "" : ` ${MATCHING_SLOT_NOT_READY_OFFSET_CLASS}`}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
