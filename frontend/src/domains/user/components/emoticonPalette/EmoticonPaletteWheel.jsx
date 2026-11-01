import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import { toSlotNumber } from "@/domains/user/constants/emoticonPaletteSlots.js"
import {
  FRAME_ASPECT_RATIO,
  FRAME_IMG_CLASS,
  SLOT_BTN_CLASS,
  SLOT_EMPTY_CLASS,
  SLOT_IDLE_CLASS,
  SLOT_POSITIONS,
  SLOT_SELECTED_CLASS,
  WHEEL_WRAP_CLASS,
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
      className={WHEEL_WRAP_CLASS}
      style={{ aspectRatio: FRAME_ASPECT_RATIO }}
    >
      <PublicAsset
        src={EMOTICON_PALETTE_ASSETS.paletteFrame}
        alt=""
        className={FRAME_IMG_CLASS}
        aria-hidden="true"
      />
      {slots.map((slotValue, index) => {
        const item = resolveItem(slotValue)
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
            className={`${SLOT_BTN_CLASS} ${
              isSelected ? SLOT_SELECTED_CLASS : SLOT_IDLE_CLASS
            }`}
          >
            {item
              ? <PublicAsset src={item.icon} alt={item.name} className="max-h-full max-w-full select-none" />
              : <span className={SLOT_EMPTY_CLASS}>비어 있음</span>}
          </button>
        )
      })}
    </div>
  )
}
