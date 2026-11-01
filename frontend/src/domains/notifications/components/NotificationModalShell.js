// 알림 창 껍데기 (어두운 바탕·틀 그림·제목·닫기 버튼, 틀 그림 실패 때 대체 틀)
// 알림 창(NotificationModal.js)이 내용을 넣어 씀
import { createElement, useEffect, useState } from "react"

import { dispatchUiSfx } from "../../../shared/hooks/useSfxRuntime.js"
import { publicAsset } from "../../../shared/utils/publicAsset.js"
import { NOTIFICATION_ASSETS } from "../constants/notificationAssets.js"
import {
  MODAL_BACKDROP_CLASS,
  MODAL_CLOSE_BTN_CLASS,
  MODAL_CLOSE_BTN_IMG_CLASS,
  MODAL_CONTENT_CLASS,
  MODAL_CONTENT_INSET,
  MODAL_FALLBACK_CONTENT_CLASS,
  MODAL_FALLBACK_FRAME_CLASS,
  MODAL_FRAME_IMG_CLASS,
  MODAL_PANEL_CLASS,
  MODAL_TITLE_CLASS,
  MODAL_WRAP_CLASS,
} from "../constants/notificationLayoutStyle.js"

// Esc로 닫기, 닫기 함수가 있을 때만 키 들음
function useEscape(onDismiss, active = true) {
  useEffect(() => {
    if (!active || !onDismiss) return undefined

    // Esc만 받아 취소 소리 내고 닫음
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onDismiss()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active, onDismiss])
}

// 열리면 닫기 버튼에 포커스 줌, focusKey가 바뀌면 다시 줌
function useCloseFocus(closeButtonRef, focusKey) {
  useEffect(() => {
    closeButtonRef?.current?.focus()
  }, [focusKey, closeButtonRef])
}

// 닫기 버튼 그리기, 닫기 함수가 없으면 안 그림
function renderCloseButton({ onDismiss, closeButtonRef }) {
  if (!onDismiss) return null

  return createElement(
    "button",
    {
      type: "button",
      ref: closeButtonRef,
      "aria-label": "닫기",
      className: MODAL_CLOSE_BTN_CLASS,
      "data-sfx-kind": "ui-cancel",
      style: { outline: "none" },
      onClick: onDismiss,
    },
    createElement("img", {
      src: publicAsset(NOTIFICATION_ASSETS.closeButton),
      alt: "",
      draggable: false,
      className: MODAL_CLOSE_BTN_IMG_CLASS,
    }),
  )
}

// 틀 그림이 안 뜨면 그림 없는 대체 틀로 바꿔 그림
export default function NotificationModalShell({
  onDismiss,
  closeButtonRef,
  focusKey,
  wrapperProps = {},
  children,
}) {
  const [frameFailed, setFrameFailed] = useState(false)

  useEscape(onDismiss, Boolean(onDismiss))
  useCloseFocus(closeButtonRef, focusKey)

  // 내용 칸: 틀 그림 안쪽 여백에 맞춤, 대체 틀이면 여백 없음
  const contentNode = createElement(
    "div",
    {
      className: frameFailed
        ? MODAL_FALLBACK_CONTENT_CLASS
        : MODAL_CONTENT_CLASS,
      "data-notification-content": "true",
      ...(frameFailed ? {} : { style: MODAL_CONTENT_INSET }),
    },
    children,
  )

  // 틀 그림 위에 제목·닫기·내용 겹침, 그림 오류면 대체 틀 사용
  const panelInner = frameFailed
    ? createElement(
        "div",
        { className: MODAL_FALLBACK_FRAME_CLASS, "data-notification-fallback": "true" },
        renderCloseButton({ onDismiss, closeButtonRef }),
        contentNode,
      )
    : createElement(
        "div",
        { className: MODAL_PANEL_CLASS },
        createElement("img", {
          src: publicAsset(NOTIFICATION_ASSETS.popupFrame),
          alt: "",
          "aria-hidden": "true",
          draggable: false,
          className: MODAL_FRAME_IMG_CLASS,
          onError: () => setFrameFailed(true),
        }),
        createElement("p", { className: MODAL_TITLE_CLASS, "data-notification-heading": "true" }, "알림"),
        renderCloseButton({ onDismiss, closeButtonRef }),
        contentNode,
      )

  // 바탕 버튼을 누르면 닫힘, 창 본체는 그 위에 띄움
  return createElement(
    "div",
    wrapperProps,
    createElement("button", {
      type: "button",
      "aria-label": "알림 닫기",
      className: MODAL_BACKDROP_CLASS,
      "data-sfx-kind": "ui-cancel",
      onClick: onDismiss,
    }),
    createElement(
      "div",
      { className: MODAL_WRAP_CLASS },
      createElement(
        "div",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "알림",
          className: frameFailed ? "pointer-events-auto max-w-full" : undefined,
        },
        panelInner,
      ),
    ),
  )
}
