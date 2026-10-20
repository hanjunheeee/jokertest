import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import { toEmoticonPaletteSlotNumber } from "@/domains/user/constants/emoticonPaletteSlots.js"
import {
  EMOTICON_PALETTE_FRAME_ASPECT_RATIO,
  EMOTICON_PALETTE_FRAME_IMG_CLASS,
  EMOTICON_PALETTE_SLOT_BTN_CLASS,
  EMOTICON_PALETTE_SLOT_EMPTY_CLASS,
  EMOTICON_PALETTE_SLOT_IDLE_CLASS,
  EMOTICON_PALETTE_SLOT_POSITIONS,
  EMOTICON_PALETTE_SLOT_SELECTED_CLASS,
  EMOTICON_PALETTE_WHEEL_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function EmoticonPaletteWheel({
  slots,
  selectedSlotIndex,
  disabled,
  resolveItem,
  onSelectSlot,
}) {
  return (
    <div
      role="group"
      aria-label="팔레트 슬롯"
      className={EMOTICON_PALETTE_WHEEL_WRAP_CLASS}
      style={{ aspectRatio: EMOTICON_PALETTE_FRAME_ASPECT_RATIO }}
    >
      <PublicAsset
        src={EMOTICON_PALETTE_ASSETS.paletteFrame}
        alt=""
        className={EMOTICON_PALETTE_FRAME_IMG_CLASS}
        aria-hidden="true"
      />
      {slots.map((slotValue, index) => {
        const item = resolveItem(slotValue)
        const position = EMOTICON_PALETTE_SLOT_POSITIONS[index]
        const isSelected = selectedSlotIndex === index

        return (
          <button
            key={`emoji-slot-${index}`}
            type="button"
            disabled={disabled}
            aria-label={`${toEmoticonPaletteSlotNumber(index)}번 슬롯`}
            aria-pressed={isSelected}
            onClick={() => onSelectSlot(index)}
            style={{ top: position.top, left: position.left }}
            className={`${EMOTICON_PALETTE_SLOT_BTN_CLASS} ${
              isSelected ? EMOTICON_PALETTE_SLOT_SELECTED_CLASS : EMOTICON_PALETTE_SLOT_IDLE_CLASS
            }`}
          >
            {item
              ? <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
              : <span className={EMOTICON_PALETTE_SLOT_EMPTY_CLASS}>비어 있음</span>}
          </button>
        )
      })}
    </div>
  )
}
