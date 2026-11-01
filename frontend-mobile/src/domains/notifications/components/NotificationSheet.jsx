// 모바일 알림 창 (목록·읽음·보러 가기·읽은 메시지 삭제), 데스크톱 NotificationModal 자리
// 로비가 { open, onClose }로 엶, 새 알림은 앱 루트 소켓 훅이 스토어에 넣어 바로 보임
import { useEffect, useRef } from "react"

import { NOTIFICATION_ASSETS } from "@/domains/notifications/constants/notificationAssets.js"
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import {
  BACKDROP_CLASS,
  CLOSE_BTN_CLASS,
  CLOSE_ICON_CLASS,
  CLOSE_STYLE,
  CONTENT_CLASS,
  CONTENT_STYLE,
  FRAME_CLASS,
  FRAME_STYLE,
  PANEL_CLASS,
  TITLE_CLASS,
  TITLE_STYLE,
  WRAP_CLASS,
} from "@m/domains/notifications/constants/sheetStyle.js"
import { useNotificationSheet } from "@m/domains/notifications/hooks/useNotificationSheet.js"
import SheetBody from "@m/domains/notifications/components/sheet/SheetBody.jsx"
import SheetFooter from "@m/domains/notifications/components/sheet/SheetFooter.jsx"

// 훅은 닫혀 있어도 돌림 (닫힐 때 포커스 되돌리기·자동 읽음 때문), Esc 닫기는 SheetPortal이 맡음
export default function NotificationSheet({ open, onClose }) {
  const closeButtonRef = useRef(null)
  const sheet = useNotificationSheet({ open, onClose })

  // 열리면 닫기 버튼에 포커스 (데스크톱과 같음)
  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open])

  return (
    <SheetPortal open={open} onClose={onClose}>
      <div key="notification-sheet" data-notification-modal="true">
        {/* 바탕을 누르면 닫힘 */}
        <button type="button" aria-label="알림 닫기" className={BACKDROP_CLASS} data-sfx-kind="ui-cancel" onClick={onClose} />
        <div className={WRAP_CLASS}>
          <div role="dialog" aria-modal="true" aria-label="알림" className={PANEL_CLASS}>
            <div aria-hidden="true" className={FRAME_CLASS} style={FRAME_STYLE} />
            <p className={TITLE_CLASS} style={TITLE_STYLE} data-notification-heading="true">알림</p>
            <CloseButton
              ref={closeButtonRef}
              label="닫기"
              src={NOTIFICATION_ASSETS.closeButton}
              className={CLOSE_BTN_CLASS}
              iconClassName={CLOSE_ICON_CLASS}
              style={CLOSE_STYLE}
              data-sfx-kind="ui-cancel"
              onClick={onClose}
            />
            <div className={CONTENT_CLASS} style={CONTENT_STYLE} data-notification-content="true">
              <SheetBody sheet={sheet} />
              <SheetFooter
                disabled={sheet.deleteDisabled}
                pending={sheet.deleteReadPending}
                error={sheet.deleteReadError}
                onDelete={sheet.deleteRead}
              />
            </div>
          </div>
        </div>
      </div>
    </SheetPortal>
  )
}
