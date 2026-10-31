import { Link } from "react-router-dom"
import RememberMeCheckbox from "@/domains/auth/components/RememberMeCheckbox.jsx"

export default function LoginOptions({ rememberMe, onRememberMeChange }) {
  return (
    <div className="relative z-10 mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <RememberMeCheckbox checked={rememberMe} onChange={onRememberMeChange} />

      <div className="flex shrink-0 items-center gap-2">
        <Link to="/find-id" className="auth-text-link">아이디 찾기</Link>
        <span className="text-white/40" aria-hidden="true">|</span>
        <Link to="/password-reset/request" className="auth-text-link">비밀번호 찾기</Link>
      </div>
    </div>
  )
}
