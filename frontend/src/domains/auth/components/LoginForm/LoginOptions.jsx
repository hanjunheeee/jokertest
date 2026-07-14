import RememberMeCheckbox from "@/domains/auth/components/RememberMeCheckbox.jsx"

// 로그인 상태 유지와 비밀번호 찾기 영역입니다.
export default function LoginOptions({ rememberMe, onRememberMeChange }) {
  return (
    <div className="relative z-10 mt-0.5 flex items-center justify-between gap-2">
      {/* 로그인 상태 유지 여부를 부모 form 상태와 연결합니다. */}
      <RememberMeCheckbox checked={rememberMe} onChange={onRememberMeChange} />

      {/* 아직 기능 연결 전인 비밀번호 찾기 버튼입니다. */}
      <button type="button" className="auth-text-link shrink-0">비밀번호 찾기</button>
    </div>
  )
}
