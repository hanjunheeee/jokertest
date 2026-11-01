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

function useEscape(onDismiss, active = true) {
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

function useCloseFocus(closeButtonRef, focusKey) {
  useEffect(() => {
    closeButtonRef?.current?.focus()
  }, [focusKey, closeButtonRef])
}

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
