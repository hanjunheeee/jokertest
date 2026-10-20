import { publicAsset } from "@/shared/utils/publicAsset.js"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"

// 로그인/회원가입 화면의 배경 영상을 담당합니다. BGM은 App의 GlobalBgmLayer가 담당합니다.
export default function AuthBackgroundMedia() {
  return (
    <video
      src={publicAsset(LOGIN_ASSETS.bgVideo)}
      autoPlay
      loop
      muted
      playsInline
      className="absolute inset-0 h-full w-full object-cover object-center"
    />
  )
}
