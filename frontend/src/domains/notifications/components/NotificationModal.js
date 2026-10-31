import { createElement, useEffect, useLayoutEffect, useRef } from "react"

import { publicAsset } from "../../../shared/utils/publicAsset.js"
import { useNotificationsStore, selectVisibleNotifications } from "../store/notifications.store.js"
import { useSettingsStore } from "../../settings/store/settingsStore.js"
import { buildNotificationTargetPath, notificationTargetLabel } from "../constants/notificationTargets.js"
import { NOTIFICATION_ASSETS } from "../constants/notificationAssets.js"
import {
  NOTIFICATION_ACTION_BUTTON_CLASS,
  NOTIFICATION_ACTION_BUTTON_IMG_CLASS,
  NOTIFICATION_ACTION_BUTTON_PRIMARY_LABEL_CLASS,
  NOTIFICATION_ACTION_BUTTON_SECONDARY_LABEL_CLASS,
  NOTIFICATION_ACTION_ROW_CLASS,
  NOTIFICATION_ERROR_CLASS,
  NOTIFICATION_MODAL_BODY_COLUMN_CLASS,
  NOTIFICATION_MODAL_FOOTER_CLASS,
  NOTIFICATION_ITEM_BODY_CLASS,
  NOTIFICATION_ITEM_INNER_CLASS,
  NOTIFICATION_ITEM_SLOT_CLASS,
  NOTIFICATION_ITEM_SLOT_IMG_CLASS,
  NOTIFICATION_ITEM_TITLE_CLASS,
  NOTIFICATION_LIST_CLASS,
  NOTIFICATION_MESSAGE_CLASS,
  NOTIFICATION_EMPTY_MESSAGE_CLASS,
} from "../constants/notificationLayoutStyle.js"
import NotificationModalShell from "./NotificationModalShell.js"
import NotificationScrollArea from "./NotificationScrollArea.jsx"

function renderActionButton({ key, label, onClick, disabled, actionAttr, variant = "primary", pending = false }) {
  const isPrimary = variant === "primary"

  return createElement(
    "button",
    {
      key,
      type: "button",
      className: NOTIFICATION_ACTION_BUTTON_CLASS,
      disabled,
      "aria-label": pending ? "처리 중" : label,
      "data-notification-action": actionAttr,
      "data-notification-action-variant": variant,
      onClick,
    },
    createElement("img", {
      src: publicAsset(
        isPrimary ? NOTIFICATION_ASSETS.actionButtonPrimary : NOTIFICATION_ASSETS.actionButtonSecondary,
      ),
      alt: "",
      draggable: false,
      className: NOTIFICATION_ACTION_BUTTON_IMG_CLASS,
    }),
    createElement(
      "span",
      {
        className: isPrimary
          ? NOTIFICATION_ACTION_BUTTON_PRIMARY_LABEL_CLASS
          : NOTIFICATION_ACTION_BUTTON_SECONDARY_LABEL_CLASS,
      },
      pending ? "처리 중…" : label,
    ),
  )
}

function NotificationItem({ item, pending, error, onRead, onOpenTarget, onClearError }) {
  const unread = !item.readAt
  const path = buildNotificationTargetPath(item.target)
  const targetLabel = notificationTargetLabel(item.target)

  const actions = []
  if (path !== null) {
    actions.push(
      renderActionButton({
        key: "open",
        label: targetLabel ?? "보러 가기",
        disabled: pending,
        pending,
        actionAttr: "open-target",
        onClick: () => onOpenTarget(item, path),
      }),
    )
  }

  return createElement(
    "li",
    {
      className: NOTIFICATION_ITEM_SLOT_CLASS,
      "data-notification-id": item.id,
      "data-notification-type": item.type,
      "data-notification-read": unread ? "false" : "true",
    },
    createElement("img", {
      src: publicAsset(NOTIFICATION_ASSETS.itemSlot),
      alt: "",
      draggable: false,
      className: NOTIFICATION_ITEM_SLOT_IMG_CLASS,
    }),
    createElement(
      "div",
      { className: NOTIFICATION_ITEM_INNER_CLASS },
      createElement("p", { className: NOTIFICATION_ITEM_TITLE_CLASS }, item.title),
      createElement("p", { className: NOTIFICATION_ITEM_BODY_CLASS }, item.body),
      actions.length > 0 ? createElement("div", { className: NOTIFICATION_ACTION_ROW_CLASS }, actions) : null,
      error
        ? createElement(
            "div",
            { className: NOTIFICATION_ACTION_ROW_CLASS },
            createElement(
              "p",
              { className: NOTIFICATION_ERROR_CLASS, role: "alert", "data-notification-read-error": item.id },
              error,
            ),
            renderActionButton({
              key: "retry",
              label: "다시 시도",
              actionAttr: "retry-read",
              onClick: () => {
                onClearError(item.id)
                onRead(item)
              },
            }),
          )
        : null,
    ),
  )
}

function resolveBodyState(status, visibleCount) {
  if (status === "error") return "error"
  if (status === "idle" || status === "loading") return "loading"
  if (visibleCount === 0) return "empty"
  return "list"
}

function renderBody({ state, error, visible, onRetry, itemProps }) {
  if (state === "error") {
    return createElement(
      "div",
      { className: "flex flex-col items-center gap-2", "data-notification-state": "error" },
      createElement("p", { className: NOTIFICATION_ERROR_CLASS, role: "alert" }, error ?? "알림을 불러오지 못했습니다."),
      renderActionButton({
        key: "retry-list",
        label: "다시 시도",
        actionAttr: "retry-list",
        onClick: onRetry,
      }),
    )
  }

  if (state === "loading") {
    return createElement(
      "p",
      { className: NOTIFICATION_MESSAGE_CLASS, "data-notification-state": "loading" },
      "알림을 불러오는 중입니다.",
    )
  }

  if (state === "empty") {
    return createElement(
      "p",
      { className: NOTIFICATION_EMPTY_MESSAGE_CLASS, "data-notification-state": "empty" },
      "표시할 알림이 없습니다.",
    )
  }

  return createElement(
    "ul",
    { className: NOTIFICATION_LIST_CLASS, "data-notification-state": "list" },
    visible.map((item) => createElement(NotificationItem, { key: item.id, item, ...itemProps(item) })),
  )
}

export default function NotificationModal({ open, onClose, onNavigate }) {
  const status = useNotificationsStore((state) => state.status)
  const error = useNotificationsStore((state) => state.error)
  const items = useNotificationsStore((state) => state.items)
  const readPendingIds = useNotificationsStore((state) => state.readPendingIds)
  const readErrors = useNotificationsStore((state) => state.readErrors)
  const deleteReadPending = useNotificationsStore((state) => state.deleteReadPending)
  const deleteReadError = useNotificationsStore((state) => state.deleteReadError)
  const generalChecks = useSettingsStore((state) => state.generalChecks)

  const restoreFocusRef = useRef(null)
  const closeButtonRef = useRef(null)

  if (open && restoreFocusRef.current === null && typeof document !== "undefined") {
    restoreFocusRef.current = document.activeElement
  }

  useEffect(() => {
    if (open) return undefined
    const previous = restoreFocusRef.current
    restoreFocusRef.current = null
    useNotificationsStore.getState().clearDeleteReadError()
    if (previous && typeof previous.focus === "function") {
      try {
        previous.focus()
      } catch {
      }
    }
    return undefined
  }, [open])

  useLayoutEffect(() => {
    if (!open || status !== "success") return undefined

    const store = useNotificationsStore.getState()
    const visible = selectVisibleNotifications(store.items, generalChecks)
    if (!visible.some((item) => !item.readAt)) return undefined

    void store.markVisibleUnreadAsRead(generalChecks)
    return undefined
  }, [open, status, generalChecks])

  if (!open) return null

  const visible = selectVisibleNotifications(items, generalChecks)
  const bodyState = resolveBodyState(status, visible.length)
  const hasReadNotifications = items.some((item) => item.readAt)
  const deleteReadDisabled = status !== "success" || deleteReadPending || !hasReadNotifications

  const handleRead = (item) => {
    useNotificationsStore.getState().markRead(item.id)
  }

  const handleOpenTarget = async (item, path) => {
    const result = await useNotificationsStore.getState().markRead(item.id)
    if (result?.ok !== true) return
    onNavigate?.(path)
  }

  const itemProps = (item) => ({
    pending: readPendingIds.includes(item.id),
    error: readErrors[item.id] ?? null,
    onRead: handleRead,
    onOpenTarget: handleOpenTarget,
    onClearError: (id) => useNotificationsStore.getState().clearReadError(id),
  })

  return createElement(
    NotificationModalShell,
    {
      onDismiss: onClose,
      closeButtonRef,
      wrapperProps: { "data-notification-modal": "true" },
    },
    createElement(
      "div",
      { className: NOTIFICATION_MODAL_BODY_COLUMN_CLASS },
      createElement(
        NotificationScrollArea,
        {
          bodyState,
          centered: bodyState !== "list",
        },
        renderBody({
          state: bodyState,
          error,
          visible,
          onRetry: () => useNotificationsStore.getState().loadSnapshot(),
          itemProps,
        }),
      ),
      createElement(
        "div",
        { className: NOTIFICATION_MODAL_FOOTER_CLASS, "data-notification-footer": "true" },
        renderActionButton({
          key: "delete-read",
          label: "읽은 메시지 삭제",
          actionAttr: "delete-read",
          variant: "secondary",
          disabled: deleteReadDisabled,
          pending: deleteReadPending,
          onClick: () => {
            useNotificationsStore.getState().clearDeleteReadError()
            void useNotificationsStore.getState().deleteReadNotifications()
          },
        }),
        deleteReadError
          ? createElement(
              "p",
              {
                className: NOTIFICATION_ERROR_CLASS,
                role: "alert",
                "data-notification-delete-error": "true",
              },
              deleteReadError,
            )
          : null,
      ),
    ),
  )
}
