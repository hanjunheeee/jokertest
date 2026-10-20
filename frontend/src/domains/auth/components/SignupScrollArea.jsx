import { useRef } from "react"
import {
  SIGNUP_SCROLL_AREA_CLASS,
  SIGNUP_SCROLL_WRAP_CLASS,
  SIGNUP_SCROLLBAR_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

// 회원가입 폼 스크롤 영역 — 네이티브 스크롤바는 숨기고 shared Scrollbar(세로)를 겹칩니다.
export default function SignupScrollArea({ children }) {
  const scrollRef = useRef(null)

  return (
    <div className={SIGNUP_SCROLL_WRAP_CLASS}>
      <div
        ref={scrollRef}
        data-signup-scroll-area=""
        className={`${SIGNUP_SCROLL_AREA_CLASS} flex flex-col gap-1.5`}
        role="region"
        aria-label="회원가입 입력"
      >
        {children}
      </div>
      <Scrollbar scrollRef={scrollRef} className={SIGNUP_SCROLLBAR_CLASS} />
    </div>
  )
}
