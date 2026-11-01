// 계정 찾기 화면 뒤 배경 영상 (데스크톱 로그인 배경과 같은 영상)
// scene/RecoveryScene.jsx가 씀
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"

// fixed라 화면 틀 전체(바닥 줄·안전영역 포함)를 덮음, 스크롤해도 안 움직임
export default function SceneBackground() {
  return (
    <video
      src={publicAsset(LOGIN_ASSETS.bgVideo)}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full object-cover object-center"
    />
  )
}
