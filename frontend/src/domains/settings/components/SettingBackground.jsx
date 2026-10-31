import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"

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
