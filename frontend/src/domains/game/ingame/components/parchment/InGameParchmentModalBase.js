import { createElement, useEffect } from "react"
import { dispatchUiSfx } from "../../../../../shared/hooks/useSfxRuntime.js"
import { INGAME_PARCHMENT_CONFIRM_LABEL } from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { getInGameParchmentModalVariant } from "../../constants/parchment/ingameParchmentModalVariants.js"
import InGameParchmentConfirmButton from "./InGameParchmentConfirmButton.js"
import InGameParchmentPanelBase from "./InGameParchmentPanelBase.js"

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

function useParchmentModalConfirmFocus(focusOnMount, confirmButtonRef, focusKey) {
  useEffect(() => {
    if (!focusOnMount) return
    confirmButtonRef?.current?.focus()
  }, [focusOnMount, focusKey, confirmButtonRef])
}

export default function InGameParchmentModalBase({
  variantKey,
  onDismiss,
  confirmLabel = INGAME_PARCHMENT_CONFIRM_LABEL,
  confirmButtonRef,
  focusKey,
  showConfirm = true,
  parchmentProps = {},
  wrapperProps = {},
  children,
}) {
  const variant = getInGameParchmentModalVariant(variantKey)

  useParchmentModalEscape(onDismiss, Boolean(onDismiss))
  useParchmentModalConfirmFocus(variant.focusConfirmOnMount, confirmButtonRef, focusKey)

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
