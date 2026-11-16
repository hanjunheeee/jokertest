// 로그인 못 하는 사람이 누르는 고객센터 글자 링크 한 줄 (주소는 환경값 VITE_SUPPORT_URL)
// components/LoginForm.jsx, pages/FindIdPage.jsx·passwordReset/RequestPage.jsx가 씀
import { SUPPORT_URL } from "@/shared/env.js"
import { resolveSupportLink } from "@/shared/utils/supportLink.js"

// 주소가 없거나 못 믿을 값이면 줄째로 안 그림 (빈 자리·깨진 링크 안 남김)
// mailto면 새 창 속성 없음 (메일 프로그램이 열림)
export default function SupportLink({ rawUrl = SUPPORT_URL, className = "" }) {
  const link = resolveSupportLink(rawUrl)
  if (!link) return null

  return (
    <p className={`text-center ${className}`}>
      <a
        href={link.href}
        className="auth-text-link"
        {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        고객센터
      </a>
    </p>
  )
}
