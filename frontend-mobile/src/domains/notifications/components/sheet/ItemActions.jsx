// 알림 하나의 버튼 줄 (보러 가기, 읽음 실패면 오류 글·다시 시도)
// 알림 줄(NotificationRow.jsx)이 씀
import {
  buildNotificationTargetPath,
  notificationTargetLabel,
} from "@/shared/constants/notificationTargets.js"
import { ACTION_ROW_CLASS, ERROR_CLASS } from "@m/domains/notifications/constants/sheetStyle.js"
import ActionButton from "@m/domains/notifications/components/sheet/ActionButton.jsx"

// 갈 곳이 있는 알림만 보러 가기, 둘 다 없으면 아무것도 안 그림
export default function ItemActions({ item, pending, error, onOpenTarget, onRetryRead }) {
  const path = buildNotificationTargetPath(item.target)
  if (path === null && !error) return null

  return (
    <>
      {path !== null ? (
        <div className={ACTION_ROW_CLASS}>
          <ActionButton
            label={notificationTargetLabel(item.target) ?? "보러 가기"}
            action="open-target"
            disabled={pending}
            pending={pending}
            onClick={() => onOpenTarget(item, path)}
          />
        </div>
      ) : null}
      {error ? (
        <div className={ACTION_ROW_CLASS}>
          <p className={ERROR_CLASS} role="alert" data-notification-read-error={item.id}>
            {error}
          </p>
          <ActionButton label="다시 시도" action="retry-read" onClick={() => onRetryRead(item)} />
        </div>
      ) : null}
    </>
  )
}
