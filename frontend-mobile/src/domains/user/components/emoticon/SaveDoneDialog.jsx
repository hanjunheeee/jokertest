// 팔레트 저장 완료 창 (양피지 그림 + 문구 + 확인, 뒤 막 누름·Esc로도 닫힘)
// EmoticonPalettePage가 씀
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  BTN_ASSET,
  CONFIRM_BTN_CLASS_RAISED_FOCUS,
  IMG_CLASS as BTN_IMG_CLASS,
  LABEL_CLASS as BTN_LABEL_CLASS,
  PARCHMENT_CONFIRM_LABEL,
} from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import {
  CONTENT_CLASS,
  FRAME_CLASS,
  IMG_CLASS,
  IMG_URL,
} from "@/domains/game/ingame/constants/parchment/ingameParchmentLayout.js"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import {
  SAVE_SUCCESS_MSG,
  SAVE_SUCCESS_MSG_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 덮개·감싸개·이름은 데스크톱 양피지 창 종류(emoticonPaletteSave) 그대로
const VARIANT = getInGameParchmentModalVariant("emoticonPaletteSave")

// 확인 버튼은 데스크톱 최대 폭으로 고정해 높이 44px 넘김
const CONFIRM_CLASS = `${CONFIRM_BTN_CLASS_RAISED_FOCUS} !w-[9.3rem]`

// 데스크톱 양피지 창(InGameParchmentModalBase)은 화면 부품이라 못 불러서 같은 상수로 다시 그림
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

  // 화면 틀(.mobile-shell) 밖 body로 꺼내야 fixed가 화면 기준
  return createPortal(
    <div data-emoticon-palette-save-success="">
      <button
        type="button"
        aria-label={VARIANT.backdropLabel}
        className={VARIANT.backdropClass}
        data-sfx-kind="ui-cancel"
        onClick={onDismiss}
      />
      <div className={VARIANT.wrapClass}>
        <div role="dialog" aria-modal="true" aria-label={VARIANT.dialogLabel} className={VARIANT.panelClass}>
          <div className={FRAME_CLASS}>
            <PublicAsset src={IMG_URL} alt="" aria-hidden="true" draggable={false} className={IMG_CLASS} />
            <div className={CONTENT_CLASS} data-parchment-content="true">
              <p role="status" className={SAVE_SUCCESS_MSG_CLASS}>{SAVE_SUCCESS_MSG}</p>
              <button
                ref={confirmRef}
                type="button"
                aria-label={PARCHMENT_CONFIRM_LABEL}
                className={CONFIRM_CLASS}
                style={{ outline: "none" }}
                data-sfx-kind="ui-confirm"
                onClick={onDismiss}
              >
                <PublicAsset src={BTN_ASSET} alt="" draggable={false} className={BTN_IMG_CLASS} />
                <span className={BTN_LABEL_CLASS}>{PARCHMENT_CONFIRM_LABEL}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
