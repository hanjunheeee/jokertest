import { useRef } from "react"
import {
  SCROLL_AREA_CLASS,
  SCROLL_WRAP_CLASS,
  SIGNUP_SCROLLBAR_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function SignupScrollArea({ children }) {
  const scrollRef = useRef(null)

  return (
    <div className={SCROLL_WRAP_CLASS}>
      <div
        ref={scrollRef}
        data-signup-scroll-area=""
        className={`${SCROLL_AREA_CLASS} flex flex-col gap-1.5`}
        role="region"
        aria-label="회원가입 입력"
      >
        {children}
      </div>
      <Scrollbar scrollRef={scrollRef} className={SIGNUP_SCROLLBAR_CLASS} />
    </div>
  )
}
