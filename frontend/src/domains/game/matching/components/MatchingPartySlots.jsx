import PlayerSlotGrid from "./PlayerSlotGrid.jsx"
import { PLAYER_SLOT_COLUMNS } from "../utils/chunkPlayerSlots.js"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import {
  SLOT_CLASS_COMPACT,
  SLOT_CLASS_LARGE,
  SLOT_NOT_READY_OFFSET_CLASS,
  SLOT_WRAP_CLASS,
  SLOTS_GRID_CLASS,
  SLOTS_ROW_CLASS,
} from "../../../../shared/constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export { PLAYER_SLOT_COLUMNS as MATCHING_SLOT_COLUMNS }

export default function MatchingPartySlots({ slots = [] }) {
  const rowCount = Math.ceil(slots.length / PLAYER_SLOT_COLUMNS) || 1
  const slotClass = rowCount > 1 ? SLOT_CLASS_COMPACT : SLOT_CLASS_LARGE

  return (
    <PlayerSlotGrid
      slots={slots}
      columns={PLAYER_SLOT_COLUMNS}
      className={SLOTS_GRID_CLASS}
      rowClassName={SLOTS_ROW_CLASS}
      renderSlot={(slot) => (
        <div key={slot.id} className={SLOT_WRAP_CLASS}>
          <PublicAsset
            src={slot.ready ? GAME_MATCHING_ASSETS.silhouetteReady : GAME_MATCHING_ASSETS.silhouetteNotReady}
            alt=""
            className={`${slotClass}${slot.ready ? "" : ` ${SLOT_NOT_READY_OFFSET_CLASS}`}`}
          />
        </div>
      )}
    />
  )
}
