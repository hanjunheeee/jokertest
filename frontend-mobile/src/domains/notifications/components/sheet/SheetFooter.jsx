// 알림 창 바닥 줄 (읽은 메시지 삭제·삭제 오류)
// 알림 창(NotificationSheet.jsx)이 틀 안 바닥에 씀
import { ERROR_CLASS, FOOTER_CLASS } from "@m/domains/notifications/constants/sheetStyle.js"
import ActionButton from "@m/domains/notifications/components/sheet/ActionButton.jsx"

// 끈 조건은 창 훅이 정함 (다 받았고 읽은 알림이 있을 때만 켬)
export default function SheetFooter({ disabled, pending, error, onDelete }) {
  return (
    <div className={FOOTER_CLASS} data-notification-footer="true">
      <ActionButton
        label="읽은 메시지 삭제"
        action="delete-read"
        variant="secondary"
        disabled={disabled}
        pending={pending}
        onClick={onDelete}
      />
      {error ? (
        <p className={ERROR_CLASS} role="alert" data-notification-delete-error="true">{error}</p>
      ) : null}
    </div>
  )
}
