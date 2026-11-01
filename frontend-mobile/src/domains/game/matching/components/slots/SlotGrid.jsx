// 대기방 자리 그림: 한 줄 5칸, 준비/미준비 실루엣 (이름·표시 없음)
// MatchingBoard가 틀 안에 씀, 줄 나누기·크기 규칙은 데스크톱 MatchingPartySlots·PlayerSlotGrid와 같음
import { GAME_MATCHING_ASSETS } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { PLAYER_SLOT_COLUMNS, chunkPlayerSlots } from "@/domains/game/matching/utils/chunkPlayerSlots.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  SLOT_COMPACT_CLASS,
  SLOT_LARGE_CLASS,
  SLOT_NOT_READY_OFFSET_CLASS,
} from "../../constants/matchingMobileStyles.js"

// 자리 줄들 (두 줄 이상이면 작은 그림, 미준비는 살짝 위로)
export default function SlotGrid({ slots = [] }) {
  const rows = chunkPlayerSlots(slots, PLAYER_SLOT_COLUMNS)
  const slotClass = rows.length > 1 ? SLOT_COMPACT_CLASS : SLOT_LARGE_CLASS

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.3cqw]">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-end justify-center gap-[1.5cqw]">
          {row.map((slot) => (
            <div key={slot.id} className="flex flex-col items-center" data-ready={slot.ready ? "" : undefined}>
              <PublicAsset
                src={slot.ready ? GAME_MATCHING_ASSETS.silhouetteReady : GAME_MATCHING_ASSETS.silhouetteNotReady}
                alt=""
                className={`${slotClass}${slot.ready ? "" : ` ${SLOT_NOT_READY_OFFSET_CLASS}`}`}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
