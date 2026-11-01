import { useRef } from "react"

import {
  CENTERED_SCROLL_AREA_CLASS,
  SCROLL_AREA_CLASS,
  SCROLL_WRAP_CLASS,
  SCROLLBAR_CLASS,
} from "@/domains/notifications/constants/notificationLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function NotificationScrollArea({ bodyState, centered = false, children }) {
  const scrollRef = useRef(null)

  return (
    <div className={SCROLL_WRAP_CLASS} data-notification-scroll-wrap="">
      <div
        ref={scrollRef}
        data-notification-scroll={bodyState}
        className={centered ? CENTERED_SCROLL_AREA_CLASS : SCROLL_AREA_CLASS}
      >
        {children}
      </div>
      <Scrollbar scrollRef={scrollRef} className={SCROLLBAR_CLASS} />
    </div>
  )
}
