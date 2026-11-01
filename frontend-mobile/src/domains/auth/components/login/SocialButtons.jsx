// Google·Discord 소셜 로그인 버튼 ("또는" 줄 포함)
// login/LoginForm.jsx가 씀
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import ImageButton from "@m/domains/auth/components/login/ui/ImageButton.jsx"
import { useSocialLoginStart } from "@m/domains/auth/hooks/useSocialLoginStart.js"

// 로그인 유지 여부를 시작 주소에 실음
export default function SocialButtons({ rememberMe = false }) {
  const { startGoogle, startDiscord } = useSocialLoginStart(rememberMe)

  return (
    <>
      <p className="text-center font-subheading font-bold leading-none text-text-body/85 app-text-scaled [--app-text-size:12px]">또는</p>

      <div className="flex flex-col gap-2">
        <ImageButton src={LOGIN_ASSETS.google} label="Google 로그인" onClick={startGoogle} className="mx-auto w-[94%]" />
        <ImageButton src={LOGIN_ASSETS.discord} label="Discord 로그인" onClick={startDiscord} className="mx-auto w-[94%]" />
      </div>
    </>
  )
}
