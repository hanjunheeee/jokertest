// 설정 화면 인트로 영상 (소리 없이 자동 재생)
// pages/SettingPage.jsx가 인트로 끝나기 전까지 씀
import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"

// 영상 ref는 useVideoIntro가 끝남·건너뛰기에 씀
export default function SettingBackground({ videoRef }) {
  return (
    <video
      ref={videoRef}
      src={publicAsset(SETTING_ASSETS.bgVideo)}
      autoPlay
      muted
      playsInline
      preload="auto"
      className="absolute inset-0 h-full w-full object-cover object-center"
    />
  )
}
