// 팔레트 8칸 바퀴 (틀 그림 + 칸 버튼, 칸 자리·모양은 데스크톱 상수 그대로)
// EmoticonPalettePage가 씀
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import { toSlotNumber } from "@/domains/user/constants/emoticonPaletteSlots.js"
import {
  FRAME_ASPECT_RATIO,
  FRAME_IMG_CLASS,
  PLATE_ICON_CLASS,
  SLOT_BTN_CLASS,
  SLOT_EMPTY_CLASS,
  SLOT_IDLE_CLASS,
  SLOT_POSITIONS,
  SLOT_SELECTED_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { emoticonItemOf } from "@/domains/user/utils/emoticonPalette/items.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 칸 하나가 바퀴 폭의 18%라 바퀴 폭 15rem 이상이면 칸이 44px 넘음
const WRAP_CLASS =
  "relative mx-auto w-[min(100%,18rem,36svh)] min-w-[15rem] land:w-[16.5rem] md:w-[min(100%,24rem,40svh)]"

// 칸마다 든 이모티콘 그림, 비면 빈 칸 글자, 고른 칸은 눌림 표시
export default function Wheel({ slots, selectedSlotIndex, disabled, onSelectSlot }) {
  return (
    <div role="group" aria-label="팔레트 슬롯" className={WRAP_CLASS} style={{ aspectRatio: FRAME_ASPECT_RATIO }}>
      <PublicAsset src={EMOTICON_PALETTE_ASSETS.paletteFrame} alt="" aria-hidden="true" className={FRAME_IMG_CLASS} />
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
            className={`${SLOT_BTN_CLASS} ${isSelected ? SLOT_SELECTED_CLASS : SLOT_IDLE_CLASS}`}
          >
            {item
              ? <PublicAsset src={item.icon} alt={item.name} className={PLATE_ICON_CLASS} />
              : <span className={SLOT_EMPTY_CLASS}>비어 있음</span>}
          </button>
        )
      })}
    </div>
  )
}
