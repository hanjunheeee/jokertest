// Google·Discord 소셜 로그인 버튼 ("또는" 줄 포함)
// login/LoginForm.jsx가 씀
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { IMAGE_BUTTON_LOOKS } from "@m/shared/ui/button/imageButtonLooks.js"
import { useSocialLoginStart } from "@m/domains/auth/hooks/useSocialLoginStart.js"

// stretch보다 세로만 낮춤 (object-fill로 비율 무시)
const SOCIAL_LOGIN_LOOK = {
  button: IMAGE_BUTTON_LOOKS.stretch.button.replace("min-h-11", "h-10"),
  img: "pointer-events-none block h-full w-full select-none object-fill",
}

// 로그인 유지 여부를 시작 주소에 실음
export default function SocialButtons({ rememberMe = false }) {
  const { startGoogle, startDiscord } = useSocialLoginStart(rememberMe)

  return (
    <>
      <p className="text-center font-subheading font-bold leading-none text-text-body/85 app-text-scaled [--app-text-size:11px]">또는</p>

      <div className="flex flex-col gap-1.5">
        <ImageButton look={SOCIAL_LOGIN_LOOK} src={LOGIN_ASSETS.google} ariaLabel="Google 로그인" onClick={startGoogle} className="mx-auto w-[88%]" />
        <ImageButton look={SOCIAL_LOGIN_LOOK} src={LOGIN_ASSETS.discord} ariaLabel="Discord 로그인" onClick={startDiscord} className="mx-auto w-[88%]" />
      </div>
    </>
  )
}
