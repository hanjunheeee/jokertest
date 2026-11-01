// 로그인 상태 유지 체크와 아이디·비밀번호 찾기 링크
// login/LoginForm.jsx가 씀
import { Link } from "react-router-dom"
import RememberMe from "@m/domains/auth/components/login/ui/RememberMe.jsx"
import { LINK_CLASS } from "@m/domains/auth/components/login/ui/styles.js"

// 좁은 폰에선 두 줄로 넘어가게 wrap, 찾기 링크는 /find-id, /password-reset/request로
export default function LoginOptions({ rememberMe, onRememberMeChange }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <RememberMe checked={rememberMe} onChange={onRememberMeChange} />

      <div className="flex shrink-0 items-center gap-1">
        <Link to="/find-id" className={LINK_CLASS}>아이디 찾기</Link>
        <span className="text-white/40" aria-hidden="true">|</span>
        <Link to="/password-reset/request" className={LINK_CLASS}>비밀번호 찾기</Link>
      </div>
    </div>
  )
}
