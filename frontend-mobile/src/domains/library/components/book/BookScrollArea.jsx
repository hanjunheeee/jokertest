// 책 본문 스크롤 (h-full 스크롤 + 모바일 그림 스크롤 막대)
// book/BookSheet.jsx가 씀
import { useRef } from "react"
import Scrollbar from "@m/shared/ui/scroll/Scrollbar.jsx"
import {
  BOOK_SCROLL_AREA_CLASS,
  BOOK_SCROLL_WRAP_CLASS,
  BOOK_SCROLLBAR_CLASS,
} from "@m/domains/library/constants/libraryStyle.js"

export default function BookScrollArea({ scrollKey, children }) {
  const scrollRef = useRef(null)

  return (
    <div className={BOOK_SCROLL_WRAP_CLASS}>
      <div key={scrollKey} ref={scrollRef} className={BOOK_SCROLL_AREA_CLASS}>
        {children}
      </div>
      <Scrollbar scrollRef={scrollRef} syncKey={scrollKey} className={BOOK_SCROLLBAR_CLASS} />
    </div>
  )
}
