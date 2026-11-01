// 팔레트 저장 완료 창 (양피지 그림 + 문구 + 확인, 뒤 막 누름·Esc로도 닫힘)
// EmoticonPalettePage가 씀
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import ImageButton from "@m/domains/user/components/emoticon/ImageButton.jsx"
import { BTN_ASSET, PARCHMENT_CONFIRM_LABEL } from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import { IMG_URL } from "@/domains/game/ingame/constants/parchment/ingameParchmentLayout.js"
import { SAVE_SUCCESS_MSG } from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 양피지 창(InGameParchmentModalBase)은 화면 부품이라 못 불러서 같은 그림으로 다시 그림
export default function SaveDoneDialog({ open, onDismiss }) {
  const confirmRef = useRef(null)

  // 뜰 때 확인 버튼에 초점, Esc로 닫기
  useEffect(() => {
    if (!open) return undefined
    confirmRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onDismiss()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onDismiss])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" data-emoticon-palette-save-success="">
      <button
        type="button"
        aria-label="팔레트 저장 안내 닫기"
        data-sfx-kind="ui-cancel"
        onClick={onDismiss}
        className="absolute inset-0 border-0 bg-black/70 p-0"
      />
      <div role="dialog" aria-modal="true" aria-label="팔레트 저장" className="relative aspect-[3/2] w-[min(100%,26rem,120svh)]">
        <PublicAsset src={IMG_URL} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-[16%] py-[15%] text-center">
          <p role="status" className="font-subheading text-lg font-bold leading-snug text-[#3a1a0c]">{SAVE_SUCCESS_MSG}</p>
          <ImageButton
            label={PARCHMENT_CONFIRM_LABEL}
            src={BTN_ASSET}
            onClick={onDismiss}
            buttonRef={confirmRef}
            className="w-[min(60%,9rem)]"
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
