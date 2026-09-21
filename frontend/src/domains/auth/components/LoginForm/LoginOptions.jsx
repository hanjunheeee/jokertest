import { Link } from "react-router-dom"
import RememberMeCheckbox from "@/domains/auth/components/RememberMeCheckbox.jsx"

// 로그인 상태 유지와 비밀번호 찾기 영역입니다.
export default function LoginOptions({ rememberMe, onRememberMeChange }) {
  return (
    <div className="relative z-10 mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      {/* 로그인 상태 유지 여부를 부모 form 상태와 연결합니다. */}
      <RememberMeCheckbox checked={rememberMe} onChange={onRememberMeChange} />

      {/* F-29a: 아이디 찾기는 비로그인 상태에서도 접근 가능한 공개 라우트(/find-id)로
          이동합니다. flex-wrap을 켜 좁은 화면에서도 두 링크가 겹치지 않고 줄바꿈됩니다. */}
      <div className="flex shrink-0 items-center gap-2">
        <Link to="/find-id" className="auth-text-link">아이디 찾기</Link>
        <span className="text-white/40" aria-hidden="true">|</span>
        {/* F-29c: 비밀번호 찾기도 아이디 찾기와 같은 방식으로 비로그인 상태에서도 접근 가능한
            공개 라우트(/password-reset/request)로 이동합니다. */}
        <Link to="/password-reset/request" className="auth-text-link">비밀번호 찾기</Link>
      </div>
    </div>
  )
}
