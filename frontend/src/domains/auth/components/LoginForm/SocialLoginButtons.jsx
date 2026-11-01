// Google·Discord 소셜 로그인 버튼
// components/LoginForm.jsx가 사용
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { API_BASE_URL } from "@/shared/env.js"

// OAuth는 서버가 제공자 화면으로 보내서 fetch 말고 페이지째 이동
export default function SocialLoginButtons({ rememberMe = false }) {
  // Google 로그인 시작, 로그인 유지 여부를 주소에 실음
  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/google?rememberMe=${rememberMe}`
  }

  // Discord 로그인 시작, 로그인 유지 여부를 주소에 실음
  const handleDiscordLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/discord?rememberMe=${rememberMe}`
  }

  return (
    <>
      <p className="text-center font-subheading app-text-scaled [--app-text-size:11px] font-bold leading-none text-text-body/85">또는</p>

      <div className="flex flex-col gap-2">
        <AuthImageButton
          src={LOGIN_ASSETS.google}
          className="mt-[3px] cursor-pointer"
          label="Google 로그인"
          onClick={handleGoogleLogin}
        />
        <AuthImageButton
          src={LOGIN_ASSETS.discord}
          className="cursor-pointer"
          label="Discord 로그인"
          onClick={handleDiscordLogin}
        />
      </div>
    </>
  )
}
