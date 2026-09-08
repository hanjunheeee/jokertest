import { STORE_ASSETS } from "../constants/storeAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

/** 상점 진입 인트로 배경 영상 */
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
