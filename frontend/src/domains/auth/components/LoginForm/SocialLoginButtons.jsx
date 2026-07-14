import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"

// 외부 계정으로 로그인하는 버튼 묶음입니다.
export default function SocialLoginButtons() {
  return (
    <>
      {/* 기본 로그인과 외부 계정 로그인을 구분하는 문구입니다. */}
      <p className="text-center font-subheading text-[11px] font-bold leading-none text-text-body/85">또는</p>

      {/* 각 서비스별 로그인 이미지 버튼입니다. 실제 OAuth 연결은 이후 onClick을 붙이면 됩니다. */}
      <div className="flex flex-col gap-2">
        <AuthImageButton src={LOGIN_ASSETS.google} className="mt-[3px] cursor-pointer" label="Google 로그인" />
        <AuthImageButton src={LOGIN_ASSETS.discord} className="cursor-pointer" label="Discord 로그인" />
      </div>
    </>
  )
}
