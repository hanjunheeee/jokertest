/**
 * 로그인 폼 본문.
 *
 * LoginPage는 제출 제어와 라우팅만 맡고, 이 컴포넌트는 로그인 화면에 필요한
 * 입력·보조 액션·소셜 버튼 배치만 담당합니다.
 */
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthInputSlot, {
  LockIcon,
  MailIcon,
} from "@/domains/auth/components/AuthInputSlot.jsx"
import RememberMeCheckbox from "@/domains/auth/components/RememberMeCheckbox.jsx"

/** 이메일/비밀번호 로그인 UI와 회원가입 전환 링크 */
export default function LoginForm({
  formData,
  rememberMe,
  onChange,
  onRememberMeChange,
  onSwitchToSignup,
}) {
  return (
    <>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] font-subheading text-[13px] font-bold leading-relaxed text-text-body/90">
          계정을 로그인 하여 모험을 계속하세요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        <AuthInputSlot
          type="email"
          name="email"
          value={formData.email}
          onChange={onChange}
          leadingIcon={<MailIcon />}
          placeholder="이메일을 입력하세요"
          autoComplete="email"
        />

        <AuthInputSlot
          name="password"
          value={formData.password}
          onChange={onChange}
          leadingIcon={<LockIcon />}
          passwordToggle
          placeholder="비밀번호를 입력하세요"
          autoComplete="current-password"
        />

        <div className="relative z-10 mt-0.5 flex items-center justify-between gap-2">
          <RememberMeCheckbox
            checked={rememberMe}
            onChange={onRememberMeChange}
          />
          <button type="button" className="auth-text-link shrink-0">
            {/* TODO: 비밀번호 찾기 플로우가 생기면 라우팅 또는 모달 제어 연결 */}
            비밀번호 찾기
          </button>
        </div>

        <AuthImageButton
          type="submit"
          src={LOGIN_ASSETS.loginButton}
          label="로그인"
          className="mt-1 cursor-pointer"
        />

        <p className="text-center font-subheading text-[11px] font-bold leading-none text-text-body/85">
          또는
        </p>
        <div className="flex flex-col gap-2">
          {/* TODO: OAuth provider별 redirect URL이 정해지면 onClick 핸들러 연결 */}
          <AuthImageButton
            src={LOGIN_ASSETS.google}
            className="mt-[3px] cursor-pointer"
            label="Google 로그인"
          />
          <AuthImageButton
            src={LOGIN_ASSETS.apple}
            className="cursor-pointer"
            label="Apple 로그인"
          />
          <AuthImageButton
            src={LOGIN_ASSETS.discord}
            className="cursor-pointer"
            label="Discord 로그인"
          />
        </div>

        <p className="mt-2 text-center font-subheading text-[13px] font-bold text-text-body">
          계정이 없으신가요?{" "}
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="auth-text-link"
          >
            회원가입
          </button>
        </p>
      </div>
    </>
  )
}
