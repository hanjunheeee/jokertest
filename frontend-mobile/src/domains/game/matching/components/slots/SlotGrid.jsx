// 대기방 자리 그림: 한 줄 5칸, 준비/미준비 실루엣 (이름 없음), 판 끝 뒤 비워 둔 방장 자리는 흐린 실루엣 + "방장 자리"
// MatchingBoard가 틀 안에 씀, 줄 나누기·크기 규칙은 데스크톱 MatchingPartySlots·PlayerSlotGrid와 같음
import { GAME_MATCHING_ASSETS } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { PLAYER_SLOT_COLUMNS, chunkPlayerSlots } from "@/domains/game/matching/utils/chunkPlayerSlots.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  SLOT_COMPACT_CLASS,
  SLOT_LARGE_CLASS,
  SLOT_NOT_READY_OFFSET_CLASS,
} from "../../constants/matchingMobileStyles.js"

// 방장 자리 이름표: 실루엣 가운데 밝은 바탕 진한 글자 (칸 높이를 안 바꿔 다른 칸과 줄 맞춤)
const RESERVED_HOST_LABEL_CLASS =
  "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-[#6b4321]/60 bg-[#f5e6c8]/90 px-1.5 py-0.5 font-subheading text-[max(0.75rem,2.6cqw)] font-bold leading-none text-[#1a1008]"

// 자리 줄들 (두 줄 이상이면 작은 그림, 미준비는 살짝 위로)
export default function SlotGrid({ slots = [] }) {
  const rows = chunkPlayerSlots(slots, PLAYER_SLOT_COLUMNS)
  const slotClass = rows.length > 1 ? SLOT_COMPACT_CLASS : SLOT_LARGE_CLASS

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.3cqw]">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-end justify-center gap-[1.5cqw]">
          {row.map((slot) => (slot.reservedHost ? (
            <div
              key={slot.id}
              className="relative flex flex-col items-center"
              data-reserved-host=""
              data-testid="matching-reserved-host-slot"
              role="img"
              aria-label="비워 둔 방장 자리"
            >
              <PublicAsset
                src={GAME_MATCHING_ASSETS.silhouetteNotReady}
                alt=""
                className={`${slotClass} ${SLOT_NOT_READY_OFFSET_CLASS} opacity-40 grayscale`}
              />
              <span className={RESERVED_HOST_LABEL_CLASS} aria-hidden="true">방장 자리</span>
            </div>
          ) : (
            <div key={slot.id} className="flex flex-col items-center" data-ready={slot.ready ? "" : undefined}>
              <PublicAsset
                src={slot.ready ? GAME_MATCHING_ASSETS.silhouetteReady : GAME_MATCHING_ASSETS.silhouetteNotReady}
                alt=""
                className={`${slotClass}${slot.ready ? "" : ` ${SLOT_NOT_READY_OFFSET_CLASS}`}`}
              />
            </div>
          )))}
        </div>
      ))}
    </div>
  )
}
