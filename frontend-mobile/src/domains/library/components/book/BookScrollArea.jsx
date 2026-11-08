// 책 본문 스크롤 (친구 초대 FriendInviteModalContent와 같은 h-full scroll + shared Scrollbar)
// book/BookSheet.jsx가 씀
import { useRef } from "react"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
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
