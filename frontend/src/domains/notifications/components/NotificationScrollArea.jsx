import { useRef } from "react"

import {
  NOTIFICATION_CENTERED_SCROLL_AREA_CLASS,
  NOTIFICATION_SCROLL_AREA_CLASS,
  NOTIFICATION_SCROLL_WRAP_CLASS,
  NOTIFICATION_SCROLLBAR_CLASS,
} from "@/domains/notifications/constants/notificationLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

/** 알림 모달 본문 스크롤 — 네이티브 스크롤바는 숨기고 shared Scrollbar를 겹칩니다. */
export default function NotificationScrollArea({ bodyState, centered = false, children }) {
  const scrollRef = useRef(null)

  return (
    <div className={NOTIFICATION_SCROLL_WRAP_CLASS} data-notification-scroll-wrap="">
      <div
        ref={scrollRef}
        data-notification-scroll={bodyState}
        className={centered ? NOTIFICATION_CENTERED_SCROLL_AREA_CLASS : NOTIFICATION_SCROLL_AREA_CLASS}
      >
        {children}
      </div>
      <Scrollbar scrollRef={scrollRef} className={NOTIFICATION_SCROLLBAR_CLASS} />
    </div>
  )
}
