// 책 본문 스크롤 (h-full 스크롤 + 모바일 그림 스크롤 막대)
// book/BookSheet.jsx가 씀
import { useLayoutEffect, useRef } from "react"
import Scrollbar from "@m/shared/ui/scroll/Scrollbar.jsx"
import {
  BOOK_SCROLL_AREA_CLASS,
  BOOK_SCROLL_WRAP_CLASS,
  BOOK_SCROLLBAR_CLASS,
} from "@m/domains/library/constants/libraryStyle.js"

export default function BookScrollArea({ scrollKey, children }) {
  const scrollRef = useRef(null)

  // 면이 바뀌면 맨 위로만 올림 (key로 다시 마운트하면 탭 화면이 업적·지갑 API를 다시 부름)
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [scrollKey])

  return (
    <div className={BOOK_SCROLL_WRAP_CLASS}>
      <div ref={scrollRef} className={BOOK_SCROLL_AREA_CLASS}>
        {children}
      </div>
      <Scrollbar scrollRef={scrollRef} syncKey={scrollKey} className={BOOK_SCROLLBAR_CLASS} />
    </div>
  )
}
