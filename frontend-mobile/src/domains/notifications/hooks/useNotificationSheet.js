// 모바일 알림 시트 상태·버튼 처리 (스토어 읽기·자동 읽음·보러 가기·다시 시도·읽은 알림 삭제·상세 고르기)
// 알림 시트(NotificationSheet.jsx)가 씀, 로직은 데스크톱 알림 스토어·훅 그대로
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { useNotificationsStore } from "@/domains/notifications/store/notifications.store.js"
import { useSettingsStore } from "@/domains/settings/store/settingsStore.js"
import { resolveBodyState, selectVisibleNotifications } from "@/domains/notifications/utils/visibleNotifications.js"
import { useAutoMarkRead } from "@/domains/notifications/hooks/notificationModal/useAutoMarkRead.js"
import { useRestoreFocus } from "@/domains/notifications/hooks/notificationModal/useRestoreFocus.js"

// 스토어 쪽 버튼 처리, 렌더마다 새로 만들어도 가벼움
function storeActions() {
  const store = () => useNotificationsStore.getState()
  return {
    // 읽음 실패 뒤 다시 시도: 오류 지우고 그 알림만 다시 읽음
    retryRead: (item) => {
      store().clearReadError(item.id)
      void store().markRead(item.id)
    },
    retryList: () => void store().loadSnapshot(),
    // 지난 삭제 오류를 먼저 지우고 지우기 시작
    deleteRead: () => {
      store().clearDeleteReadError()
      void store().deleteReadNotifications()
    },
  }
}

// 시트에 필요한 값과 처리 함수 묶음, 닫혀 있어도 훅은 돌림 (포커스 되돌리기 때문)
export function useNotificationSheet({ open, onClose }) {
  const status = useNotificationsStore((state) => state.status)
  const error = useNotificationsStore((state) => state.error)
  const items = useNotificationsStore((state) => state.items)
  const readPendingIds = useNotificationsStore((state) => state.readPendingIds)
  const readErrors = useNotificationsStore((state) => state.readErrors)
  const deleteReadPending = useNotificationsStore((state) => state.deleteReadPending)
  const deleteReadError = useNotificationsStore((state) => state.deleteReadError)
  const generalChecks = useSettingsStore((state) => state.generalChecks)
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(null)
  // 닫히면 상세 고른 것 비움 (다시 열면 목록부터), 렌더 중 맞추기
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setSelectedId(null)
  }

  useRestoreFocus(open)
  useAutoMarkRead(open, status, generalChecks)

  const visible = selectVisibleNotifications(items, generalChecks)
  const bodyState = resolveBodyState(status, visible.length)
  // 지워졌거나 설정에서 숨긴 알림이면 상세 대신 목록
  const selected = visible.find((item) => item.id === selectedId) ?? null
  // 목록을 다 받았고 읽은 알림이 있을 때만 삭제 버튼 켬
  const hasRead = items.some((item) => item.readAt)

  // 읽음이 확정된 뒤에만 시트 닫고 이동
  const openTarget = async (item, path) => {
    const result = await useNotificationsStore.getState().markRead(item.id)
    if (result?.ok !== true) return
    onClose?.()
    navigate(path)
  }

  // 항목마다 처리 중·오류 상태
  const itemState = (item) => ({
    pending: readPendingIds.includes(item.id),
    error: readErrors[item.id] ?? null,
  })

  return {
    bodyState,
    error,
    visible,
    selected,
    itemState,
    select: setSelectedId,
    back: () => setSelectedId(null),
    openTarget,
    ...storeActions(),
    deleteDisabled: status !== "success" || deleteReadPending || !hasRead,
    deleteReadPending,
    deleteReadError,
  }
}
