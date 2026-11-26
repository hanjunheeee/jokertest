// 로그인 못 하는 사람이 누르는 모바일 고객센터 글자 링크 한 줄 (주소는 환경값 VITE_SUPPORT_URL)
// login/LoginForm.jsx, pages/FindIdPage.jsx·PasswordResetRequestPage.jsx가 씀
import { SUPPORT_URL } from "@/shared/env.js"
import { resolveSupportLink } from "@/shared/utils/supportLink.js"

// 주소가 없거나 허용되지 않는 형식이면 줄째로 안 그림, mailto면 새 창 속성 없음
export default function SupportLink({ rawUrl = SUPPORT_URL, className = "" }) {
  const link = resolveSupportLink(rawUrl)
  if (!link) return null

  return (
    <p className={`text-center ${className}`.trim()}>
      <a
        href={link.href}
        className="auth-text-link inline-flex min-h-11 items-center px-2 !text-[#3b1f0b]"
        {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        고객센터
      </a>
    </p>
  )
}
