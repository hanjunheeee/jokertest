// 팔레트 바퀴 칸 (8칸 바퀴 + 저장·취소 버튼 줄)
// EmoticonPalettePage가 씀
import EmoticonPaletteImageButton from "@/domains/user/components/emoticonPalette/EmoticonPaletteImageButton.jsx"
import EmoticonPaletteWheel from "@/domains/user/components/emoticonPalette/EmoticonPaletteWheel.jsx"
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  ACTION_ROW_CLASS,
  WHEEL_SECTION_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { emoticonItemOf } from "@/domains/user/utils/emoticonPalette/items.js"

// 저장 중에는 저장·취소를 모두 잠금
export default function EmoticonWheelSection({ page }) {
  return (
    <section aria-label="이모티콘 팔레트" className={WHEEL_SECTION_CLASS}>
      <EmoticonPaletteWheel
        slots={page.selectedSlots}
        selectedSlotIndex={page.selectedSlotIndex}
        disabled={!page.isReady}
        resolveItem={emoticonItemOf}
        onSelectSlot={page.selectSlot}
      />

      <div className={ACTION_ROW_CLASS}>
        <EmoticonPaletteImageButton
          label="저장"
          src={EMOTICON_PALETTE_ASSETS.saveButton}
          disabled={!page.isReady || page.saving}
          onClick={page.handleSave}
        />
        <EmoticonPaletteImageButton
          label="취소"
          src={EMOTICON_PALETTE_ASSETS.cancelButton}
          disabled={!page.isReady || page.saving}
          onClick={page.handleCancel}
        />
      </div>
    </section>
  )
}
