// 가입 칸 스크롤 영역 (기본 스크롤바 숨기고 공용 Scrollbar 붙임)
// components/SignupForm.jsx, components/SocialSignupForm.jsx가 사용
import { useRef } from "react"
import {
  SCROLL_AREA_CLASS,
  SCROLL_WRAP_CLASS,
  SIGNUP_SCROLLBAR_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

// data-signup-scroll-area는 이메일 인증 칸이 이 영역을 찾아 굴릴 때 씀
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
