// 인증 화면 뒤 배경 영상 (반복 재생)
// components/AuthScene.jsx가 사용
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"

// 소리 끔·playsInline이라야 브라우저가 자동 재생을 막지 않음
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
