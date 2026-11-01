// 알림 창 (목록·읽음·보러 가기·읽은 메시지 삭제)
// 로비 친구 영역(LobbyFriendArea.jsx)이 씀, 항목·본문·바닥 줄은 modal/ 아래
import { createElement, useRef } from "react"

import { useNotificationsStore } from "../store/notifications.store.js"
import { resolveBodyState, selectVisibleNotifications } from "../utils/visibleNotifications.js"
import { useSettingsStore } from "../../settings/store/settingsStore.js"
import { MODAL_BODY_COLUMN_CLASS } from "../constants/notificationLayoutStyle.js"
import { useRestoreFocus } from "../hooks/notificationModal/useRestoreFocus.js"
import { useAutoMarkRead } from "../hooks/notificationModal/useAutoMarkRead.js"
import NotificationModalShell from "./NotificationModalShell.js"
import NotificationScrollArea from "./NotificationScrollArea.jsx"
import { renderBody } from "./modal/renderBody.js"
import { renderFooter } from "./modal/renderFooter.js"

// 닫혀 있으면 아무것도 안 그림, 설정에서 끈 종류는 목록에서 뺌
export default function NotificationModal({ open, onClose, onNavigate }) {
  const status = useNotificationsStore((state) => state.status)
  const error = useNotificationsStore((state) => state.error)
  const items = useNotificationsStore((state) => state.items)
  const readPendingIds = useNotificationsStore((state) => state.readPendingIds)
  const readErrors = useNotificationsStore((state) => state.readErrors)
  const deleteReadPending = useNotificationsStore((state) => state.deleteReadPending)
  const deleteReadError = useNotificationsStore((state) => state.deleteReadError)
  const generalChecks = useSettingsStore((state) => state.generalChecks)

  // 훅은 닫혀 있어도 돌림, 닫힐 때 포커스 되돌리기 위함
  useRestoreFocus(open)
  const closeButtonRef = useRef(null)
  useAutoMarkRead(open, status, generalChecks)

  if (!open) return null

  const visible = selectVisibleNotifications(items, generalChecks)
  const bodyState = resolveBodyState(status, visible.length)
  // 목록을 다 받았고 읽은 알림이 있을 때만 삭제 버튼 켬
  const hasRead = items.some((item) => item.readAt)
  const deleteDisabled = status !== "success" || deleteReadPending || !hasRead

  // 읽음 실패 뒤 다시 시도 때 읽음만 다시 보냄
  const handleRead = (item) => {
    useNotificationsStore.getState().markRead(item.id)
  }

  // 읽음이 확정된 뒤에만 이동함
  const handleOpenTarget = async (item, path) => {
    const result = await useNotificationsStore.getState().markRead(item.id)
    if (result?.ok !== true) return
    onNavigate?.(path)
  }

  // 항목마다 처리 중·오류 상태와 버튼 처리 함수 묶음
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
      { className: MODAL_BODY_COLUMN_CLASS },
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
      renderFooter({ disabled: deleteDisabled, pending: deleteReadPending, error: deleteReadError }),
    ),
  )
}
