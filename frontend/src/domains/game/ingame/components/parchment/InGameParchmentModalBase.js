// 양피지 창 바탕: 뒤 막·창·양피지·확인 버튼, 움직임 없이 바로 뜸
// 단계 입장·밤 개인 결과·낮 시작 연출 글 창과 매칭 시작 막힘·이모티콘 저장 창이 사용
import { createElement, useEffect, useRef } from "react"
import { useInGameModalLayer } from "../../hooks/useInGameModalLayer.js"
import { PARCHMENT_CONFIRM_LABEL } from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { getInGameParchmentModalVariant } from "../../constants/parchment/ingameParchmentModalVariants.js"
import InGameParchmentConfirmButton from "./InGameParchmentConfirmButton.js"
import InGameParchmentPanelBase from "./InGameParchmentPanelBase.js"

// Esc로 닫기 (닫을 함수 있을 때만, 겹친 창 중 맨 위만), 초점 옮기기는 아래 확인 버튼 초점이 맡음
function useParchmentModalEscape(onDismiss, active = true) {
  useInGameModalLayer({ open: active && Boolean(onDismiss), onClose: onDismiss, moveFocus: false, trapFocus: false })
}

// 방금 초점을 잃은 요소와 그 시각 (단추가 꺼지는 동안 초점이 몸통으로 빠진 뒤 창이 떠도 연 단추를 알기 위함)
// 예: "게임시작" 누름 → 요청 중 단추 꺼짐(초점 빠짐) → 거절 → 막힘 창
const RECENT_BLUR_MS = 5_000
let recentBlur = null
let blurWatchInstalled = false

function watchRecentBlur() {
  if (blurWatchInstalled || typeof document === "undefined") return
  blurWatchInstalled = true
  document.addEventListener("focusout", (event) => {
    recentBlur = { element: event.target, at: Date.now() }
  }, true)
}
// 파일을 불러올 때 바로 감시 붙임 (창이 처음 뜰 때 붙이면 그보다 앞서 꺼진 단추를 못 봐서 첫 창은 초점이 몸통으로 빠졌음)
watchRecentBlur()

// 열기 전 초점 자리: 지금 초점, 몸통이면 5초 안에 초점을 잃은 단추
function findOpener() {
  const active = document.activeElement
  if (active && active !== document.body) return active
  if (recentBlur && Date.now() - recentBlur.at <= RECENT_BLUR_MS && recentBlur.element?.tagName === "BUTTON") return recentBlur.element
  return null
}

// 닫힐 때 열기 전 초점 자리로 되돌림 (확인 버튼에 초점을 옮긴 창만, 닫히며 초점이 몸통으로 빠지던 것 막기)
// 그 자리가 사라졌거나 꺼졌거나 닫는 사이 다른 곳이 초점을 가져갔으면 그대로 둠, 아래 확인 버튼 초점보다 먼저 불러야 열기 전 자리를 잡음
// 열기 전 자리는 처음 한 번만 잡아 둠 (StrictMode가 효과를 두 번 돌리면 두 번째엔 이미 확인 버튼에 초점이 있어 그 버튼을 연 자리로 잡았음)
function useRestoreFocusOnClose(active) {
  watchRecentBlur()
  const openerRef = useRef(null)
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined
    if (!openerRef.current) openerRef.current = findOpener()
    const opener = openerRef.current
    return () => {
      const current = document.activeElement
      if (current && current !== document.body) return
      if (!opener?.isConnected || opener.disabled || typeof opener.focus !== "function") return
      opener.focus()
    }
  }, [active])
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
  useRestoreFocusOnClose(variant.focusConfirmOnMount)
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
