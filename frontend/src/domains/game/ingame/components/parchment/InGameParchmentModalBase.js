// 파일 역할: InGameParchmentModalBase.js - 정적 파치먼트 모달 셸입니다.
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
      // F-16(AC-01): Escape로 실제로 닫히는 이 경로만 취소음을 낸다. 같은 keydown 이벤트를
      // 여러 오버레이가 함께 듣더라도 dispatchUiSfx가 native Event로 중복을 걸러 한 번만 난다.
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

/**
 * 정적 파치먼트 모달 — backdrop + 중앙 패널 + 확인 버튼 + children.
 * framer-motion이 필요 없는 연출(DAY/NIGHT 진입)이 이 셸을 쓴다.
 *
 * 표시 전용이다: 소켓 emit·store 변경·phase 전이를 일절 하지 않는다.
 */
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
      // backdrop 클릭은 취소다(확인 버튼과 같은 onDismiss를 쓰더라도 진입별로 의미를 구분한다).
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
            // variant가 자기 안쪽 영역 치수를 가진 경우에만 넘긴다. 없으면 undefined가
            // 그대로 전달돼 패널이 기존 공용 기본값을 쓴다(다른 모달은 그대로다).
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
