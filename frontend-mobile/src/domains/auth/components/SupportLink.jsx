// 로그인 못 하는 사람이 누르는 고객센터 글자 링크 한 줄 (주소는 환경값 VITE_SUPPORT_URL, 데스크톱 SupportLink의 모바일 짝)
// login/LoginForm.jsx, pages/FindIdPage.jsx·PasswordResetRequestPage.jsx가 씀
import { SUPPORT_URL } from "@/shared/env.js"
import { resolveSupportLink } from "@/shared/utils/supportLink.js"
import { LINK_CLASS } from "@m/domains/auth/components/login/ui/styles.js"

// 주소가 없거나 못 믿을 값이면 줄째로 안 그림 (빈 자리·깨진 링크 안 남김)
// mailto면 새 창 속성 없음 (메일 프로그램이 열림), 누르는 높이 44px은 LINK_CLASS 그대로
export default function SupportLink({ rawUrl = SUPPORT_URL }) {
  const link = resolveSupportLink(rawUrl)
  if (!link) return null

  return (
    <p className="flex justify-center">
      <a
        href={link.href}
        className={LINK_CLASS}
        {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        고객센터
      </a>
    </p>
  )
}
