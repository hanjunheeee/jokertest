import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { API_BASE_URL } from "@/shared/env.js"

// 외부 계정으로 로그인하는 버튼 묶음입니다.
// rememberMe: 로그인 폼의 "로그인 상태 유지" 체크박스 값입니다. Google·Discord 로그인은
// 둘 다 서버가 시작하는 페이지 이동(F-06 GET /auth/google, F-07 GET /auth/discord)이라
// fetch로 값을 실어 보낼 수 없고, 이 이동을 시작하는 시점의 쿼리로만 전달할 수 있습니다 —
// 그 이후(콜백)부터는 서버가 그 시점에 쿠키로 보존한 값만 신뢰합니다.
export default function SocialLoginButtons({ rememberMe = false }) {
  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/google?rememberMe=${rememberMe}`
  }

  const handleDiscordLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/discord?rememberMe=${rememberMe}`
  }

  return (
    <>
      {/* 기본 로그인과 외부 계정 로그인을 구분하는 문구입니다. */}
      <p className="text-center font-subheading text-[11px] font-bold leading-none text-text-body/85">또는</p>

      {/* 각 서비스별 로그인 이미지 버튼입니다. */}
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
