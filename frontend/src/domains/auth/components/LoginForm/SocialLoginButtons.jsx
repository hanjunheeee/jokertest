import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { API_BASE_URL } from "@/shared/env.js"

export default function SocialLoginButtons({ rememberMe = false }) {
  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/google?rememberMe=${rememberMe}`
  }

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
