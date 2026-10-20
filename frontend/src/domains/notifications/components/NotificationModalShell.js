// 파일 역할: NotificationModalShell.js - 알림 모달 전용 셸(매칭 팝업 프레임 + 우상단 닫기).
import { createElement, useEffect, useState } from "react"

import { dispatchUiSfx } from "../../../shared/hooks/useSfxRuntime.js"
import { publicAsset } from "../../../shared/utils/publicAsset.js"
import { NOTIFICATION_ASSETS } from "../constants/notificationAssets.js"
import {
  NOTIFICATION_MODAL_BACKDROP_CLASS,
  NOTIFICATION_MODAL_CLOSE_BTN_CLASS,
  NOTIFICATION_MODAL_CLOSE_BTN_IMG_CLASS,
  NOTIFICATION_MODAL_CONTENT_CLASS,
  NOTIFICATION_MODAL_CONTENT_INSET,
  NOTIFICATION_MODAL_FALLBACK_CONTENT_CLASS,
  NOTIFICATION_MODAL_FALLBACK_FRAME_CLASS,
  NOTIFICATION_MODAL_FRAME_IMG_CLASS,
  NOTIFICATION_MODAL_PANEL_CLASS,
  NOTIFICATION_MODAL_TITLE_CLASS,
  NOTIFICATION_MODAL_WRAP_CLASS,
} from "../constants/notificationLayoutStyle.js"

function useNotificationModalEscape(onDismiss, active = true) {
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

function useNotificationModalCloseFocus(closeButtonRef, focusKey) {
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
      className: NOTIFICATION_MODAL_CLOSE_BTN_CLASS,
      "data-sfx-kind": "ui-cancel",
      style: { outline: "none" },
      onClick: onDismiss,
    },
    createElement("img", {
      src: publicAsset(NOTIFICATION_ASSETS.closeButton),
      alt: "",
      draggable: false,
      className: NOTIFICATION_MODAL_CLOSE_BTN_IMG_CLASS,
    }),
  )
}

/**
 * 알림 모달 셸 — backdrop + 매칭 팝업 프레임 + 제목 + 본문(children) + 우상단 닫기.
 * 표시 전용: store·소켓을 직접 건드리지 않는다.
 */
export default function NotificationModalShell({
  onDismiss,
  closeButtonRef,
  focusKey,
  wrapperProps = {},
  children,
}) {
  const [frameFailed, setFrameFailed] = useState(false)

  useNotificationModalEscape(onDismiss, Boolean(onDismiss))
  useNotificationModalCloseFocus(closeButtonRef, focusKey)

  const contentNode = createElement(
    "div",
    {
      className: frameFailed
        ? NOTIFICATION_MODAL_FALLBACK_CONTENT_CLASS
        : NOTIFICATION_MODAL_CONTENT_CLASS,
      "data-notification-content": "true",
      ...(frameFailed ? {} : { style: NOTIFICATION_MODAL_CONTENT_INSET }),
    },
    children,
  )

  const panelInner = frameFailed
    ? createElement(
        "div",
        { className: NOTIFICATION_MODAL_FALLBACK_FRAME_CLASS, "data-notification-fallback": "true" },
        renderCloseButton({ onDismiss, closeButtonRef }),
        contentNode,
      )
    : createElement(
        "div",
        { className: NOTIFICATION_MODAL_PANEL_CLASS },
        createElement("img", {
          src: publicAsset(NOTIFICATION_ASSETS.popupFrame),
          alt: "",
          "aria-hidden": "true",
          draggable: false,
          className: NOTIFICATION_MODAL_FRAME_IMG_CLASS,
          onError: () => setFrameFailed(true),
        }),
        createElement("p", { className: NOTIFICATION_MODAL_TITLE_CLASS, "data-notification-heading": "true" }, "알림"),
        renderCloseButton({ onDismiss, closeButtonRef }),
        contentNode,
      )

  return createElement(
    "div",
    wrapperProps,
    createElement("button", {
      type: "button",
      "aria-label": "알림 닫기",
      className: NOTIFICATION_MODAL_BACKDROP_CLASS,
      "data-sfx-kind": "ui-cancel",
      onClick: onDismiss,
    }),
    createElement(
      "div",
      { className: NOTIFICATION_MODAL_WRAP_CLASS },
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
