// 모바일 알림 시트 (화면 전체: 목록·상세·읽음·보러 가기·읽은 메시지 삭제)
// 로비 등이 { open, onClose }로 엶, 새 알림은 앱 루트 소켓 훅이 스토어에 넣어 바로 보임
import { useRef } from "react"

import { SHEET_COLUMN_CLASS, SHEET_ROOT_CLASS, BODY_WRAP_CLASS } from "@m/domains/notifications/constants/sheetStyle.js"
import { useNotificationSheet } from "@m/domains/notifications/hooks/useNotificationSheet.js"
import { useSheetKeys } from "@m/domains/notifications/hooks/useSheetKeys.js"
import SheetHeader from "@m/domains/notifications/components/sheet/SheetHeader.jsx"
import SheetBody from "@m/domains/notifications/components/sheet/SheetBody.jsx"
import SheetFooter from "@m/domains/notifications/components/sheet/SheetFooter.jsx"

// 닫혀 있으면 안 그림, 훅은 늘 돌림 (닫힐 때 포커스 되돌리기·자동 읽음 때문)
export default function NotificationSheet({ open, onClose }) {
  const closeButtonRef = useRef(null)
  const sheet = useNotificationSheet({ open, onClose })
  const inDetail = sheet.selected !== null

  useSheetKeys({ open, inDetail, onBack: sheet.back, onClose, closeButtonRef })

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="알림" className={SHEET_ROOT_CLASS} data-notification-sheet="true">
      <div className={SHEET_COLUMN_CLASS}>
        <SheetHeader inDetail={inDetail} onBack={sheet.back} onClose={onClose} closeButtonRef={closeButtonRef} />
        <div className={BODY_WRAP_CLASS}>
          <SheetBody sheet={sheet} />
        </div>
        <SheetFooter
          disabled={sheet.deleteDisabled}
          pending={sheet.deleteReadPending}
          error={sheet.deleteReadError}
          onDelete={sheet.deleteRead}
        />
      </div>
    </div>
  )
}
