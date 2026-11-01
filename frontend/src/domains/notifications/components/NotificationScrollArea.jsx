// 알림 창 스크롤 영역 (기본 스크롤바 숨기고 공용 Scrollbar 붙임)
// 알림 창(NotificationModal.js)이 본문을 넣어 씀
import { useRef } from "react"

import {
  CENTERED_SCROLL_AREA_CLASS,
  SCROLL_AREA_CLASS,
  SCROLL_WRAP_CLASS,
  SCROLLBAR_CLASS,
} from "@/domains/notifications/constants/notificationLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

// 공용 Scrollbar가 이 칸을 따라 움직임, centered면 가운데 정렬 (목록 아닐 때 켬)
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
