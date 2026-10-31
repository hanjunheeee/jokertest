import { MODE_SCREEN_ASSETS } from "@/domains/game/mode/constants/modeAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"

export default function ModeBackground({ src = MODE_SCREEN_ASSETS.bg }) {
  return (
    <img
      src={publicAsset(src)}
      alt=""
      className="absolute inset-0 h-full w-full object-cover object-center"
      draggable={false}
    />
  )
}
