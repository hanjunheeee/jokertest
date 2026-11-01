// 양피지 창 바탕: 뒤 막·창·양피지·확인 버튼, 움직임 없이 바로 뜸
// 단계 입장·밤 개인 결과·밤 성공 창과 매칭 시작 막힘·이모티콘 저장 창이 사용
import { createElement, useEffect } from "react"
import { dispatchUiSfx } from "../../../../../shared/hooks/useSfxRuntime.js"
import { PARCHMENT_CONFIRM_LABEL } from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { getInGameParchmentModalVariant } from "../../constants/parchment/ingameParchmentModalVariants.js"
import InGameParchmentConfirmButton from "./InGameParchmentConfirmButton.js"
import InGameParchmentPanelBase from "./InGameParchmentPanelBase.js"

// Esc로 닫기 (닫을 함수 있을 때만)
function useParchmentModalEscape(onDismiss, active = true) {
  useEffect(() => {
    if (!active || !onDismiss) return undefined

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onDismiss()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active, onDismiss])
}

// 뜰 때·focusKey 바뀔 때 확인 버튼에 초점 (variant가 켠 창만)
function useConfirmFocus(focusOnMount, confirmButtonRef, focusKey) {
  useEffect(() => {
    if (!focusOnMount) return
    confirmButtonRef?.current?.focus()
  }, [focusOnMount, focusKey, confirmButtonRef])
}

// 바깥 누름·Esc·확인 모두 onDismiss, showConfirm 끄면 확인 버튼은 부르는 쪽이 직접 둠
export default function InGameParchmentModalBase({
  variantKey,
  onDismiss,
  confirmLabel = PARCHMENT_CONFIRM_LABEL,
  confirmButtonRef,
  focusKey,
  showConfirm = true,
  parchmentProps = {},
  wrapperProps = {},
  children,
}) {
  const variant = getInGameParchmentModalVariant(variantKey)

  useParchmentModalEscape(onDismiss, Boolean(onDismiss))
  useConfirmFocus(variant.focusConfirmOnMount, confirmButtonRef, focusKey)

  return createElement(
    "div",
    wrapperProps,
    createElement("button", {
      type: "button",
      "aria-label": variant.backdropLabel,
      className: variant.backdropClass,
      "data-sfx-kind": "ui-cancel",
      onClick: onDismiss,
    }),
    createElement(
      "div",
      { className: variant.wrapClass },
      createElement(
        "div",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": variant.dialogLabel,
          className: variant.panelClass,
        },
        createElement(
          InGameParchmentPanelBase,
          {
            frameClassName: variant.parchmentFrameClass,
            fallbackFrameClassName: variant.parchmentFallbackFrameClass,
            contentClassName: variant.parchmentContentClass,
            contentBaseClassName: variant.parchmentContentBaseClass,
            fallbackContentBaseClassName: variant.parchmentFallbackContentBaseClass,
            ...parchmentProps,
          },
          children,
          showConfirm && onDismiss
            ? createElement(InGameParchmentConfirmButton, {
                label: confirmLabel,
                onClick: onDismiss,
                buttonRef: confirmButtonRef,
                className: variant.confirmButtonClass,
              })
            : null,
        ),
      ),
    ),
  )
}
