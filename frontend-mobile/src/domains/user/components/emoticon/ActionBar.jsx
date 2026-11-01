// 팔레트 저장·취소 그림 버튼 줄 (화면 틀 바닥 자리에 붙음)
// EmoticonPalettePage가 씀
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"
import {
  IMG_BTN_IMG_CLASS,
  IMG_BTN_LABEL_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

// 데스크톱 저장·취소 버튼 모양 (폭만 폰에 맞춰 키워 높이 44px 넘김)
const LOOK = {
  button:
    "interactive-scale group relative block min-h-11 w-[min(42%,10rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-40",
  img: IMG_BTN_IMG_CLASS,
  label: IMG_BTN_LABEL_CLASS,
}

// 불러오기 전·저장 중엔 둘 다 잠금 (데스크톱 EmoticonWheelSection과 같음)
export default function ActionBar({ page }) {
  const locked = !page.isReady || page.saving

  return (
    <ShellBottom>
      <div className="flex items-center justify-center gap-3 border-t border-[#c9a227]/20 bg-black/80 px-4 py-2 backdrop-blur-sm">
        <ImageButton look={LOOK} label="저장" src={EMOTICON_PALETTE_ASSETS.saveButton} disabled={locked} onClick={page.handleSave} />
        <ImageButton look={LOOK} label="취소" src={EMOTICON_PALETTE_ASSETS.cancelButton} disabled={locked} onClick={page.handleCancel} />
      </div>
    </ShellBottom>
  )
}
