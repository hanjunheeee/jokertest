// 팔레트 저장·취소 그림 버튼 줄 (화면 틀 바닥 자리에 붙음)
// EmoticonPalettePage가 씀
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { EMOTICON_PALETTE_ASSETS } from "@/domains/user/constants/emoticonPaletteAssets.js"

// 불러오기 전·저장 중엔 둘 다 잠금 (데스크톱 EmoticonWheelSection과 같음)
export default function ActionBar({ page }) {
  const locked = !page.isReady || page.saving

  return (
    <ShellBottom>
      <div className="flex items-center justify-center gap-3 border-t border-[#c9a227]/20 bg-black/80 px-4 py-2 backdrop-blur-sm">
        <ImageButton look="plain" label="저장" src={EMOTICON_PALETTE_ASSETS.saveButton} disabled={locked} onClick={page.handleSave} className="w-[min(42%,10rem)]" />
        <ImageButton look="plain" label="취소" src={EMOTICON_PALETTE_ASSETS.cancelButton} disabled={locked} onClick={page.handleCancel} className="w-[min(42%,10rem)]" />
      </div>
    </ShellBottom>
  )
}
