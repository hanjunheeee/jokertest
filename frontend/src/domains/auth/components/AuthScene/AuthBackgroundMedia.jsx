import { publicAsset } from "@/shared/utils/publicAsset.js"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"

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
