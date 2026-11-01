// 인증 화면 뒤 배경 영상 (반복 재생), 데스크톱처럼 덮개 없음
// login/scene/Scene.jsx가 씀
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"

// fixed라 페이지를 굴려도 배경은 그대로, 소리 끔·playsInline이라야 폰이 자동 재생을 안 막음
export default function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 bg-black" aria-hidden="true">
      <video
        src={publicAsset(LOGIN_ASSETS.bgVideo)}
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full object-cover object-center"
      />
    </div>
  )
}
