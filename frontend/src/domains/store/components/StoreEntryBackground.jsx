import { STORE_ASSETS } from "../../../shared/constants/storeAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

export default function StoreEntryBackground({ videoRef }) {
  return (
    <video
      ref={videoRef}
      src={publicAsset(STORE_ASSETS.entryVideo)}
      autoPlay
      muted
      playsInline
      preload="auto"
      className="absolute inset-0 z-10 h-full w-full object-cover object-center"
    />
  )
}
