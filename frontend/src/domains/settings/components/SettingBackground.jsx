// 파일 역할: SettingBackground.jsx - 화면을 구성하는 컴포넌트입니다.
import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"

/** 설정 화면의 인트로 배경 영상을 렌더링합니다. */
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
