// 팔레트 8칸 바퀴 (틀 그림 + 칸 버튼, 칸 자리는 데스크톱 상수 그대로)
// EmoticonPalettePage가 씀
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import { toSlotNumber } from "@/domains/user/constants/emoticonPaletteSlots.js"
import { FRAME_ASPECT_RATIO, SLOT_POSITIONS } from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { emoticonItemOf } from "@/domains/user/utils/emoticonPalette/items.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 칸 하나가 바퀴 폭의 18%라 바퀴 폭 15rem 이상이면 칸이 44px 넘음
const SLOT_CLASS =
  "absolute z-10 flex h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] bg-black/30 p-[2%] transition-[transform,box-shadow,border-color] duration-200 disabled:opacity-45"
const SELECTED_CLASS =
  "z-20 scale-[1.08] border-[#a63d32] bg-[#8b3530]/42 shadow-[0_0_0.15rem_rgba(166,61,50,0.9),0_0_0.55rem_rgba(140,50,42,0.65)]"

// 칸마다 든 이모티콘 그림, 비면 빈 칸 글자, 고른 칸은 눌림 표시
export default function Wheel({ slots, selectedSlotIndex, disabled, onSelectSlot }) {
  return (
    <div
      role="group"
      aria-label="팔레트 슬롯"
      className="relative mx-auto w-[min(100%,18rem,36svh)] min-w-[15rem] land:w-[16.5rem] md:w-[min(100%,24rem,40svh)]"
      style={{ aspectRatio: FRAME_ASPECT_RATIO }}
    >
      <PublicAsset
        src={EMOTICON_PALETTE_ASSETS.paletteFrame}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill"
      />
      {slots.map((slotValue, index) => {
        const item = emoticonItemOf(slotValue)
        const position = SLOT_POSITIONS[index]
        const isSelected = selectedSlotIndex === index

        return (
          <button
            key={`emoji-slot-${index}`}
            type="button"
            disabled={disabled}
            aria-label={`${toSlotNumber(index)}번 슬롯`}
            aria-pressed={isSelected}
            onClick={() => onSelectSlot(index)}
            style={{ top: position.top, left: position.left }}
            className={`${SLOT_CLASS} ${isSelected ? SELECTED_CLASS : "border-transparent opacity-90"}`}
          >
            {item ? (
              <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
            ) : (
              <span className="text-[0.6rem] leading-tight text-[#3a1a0c] opacity-70">비어 있음</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
