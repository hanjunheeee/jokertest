// 상점 입장 영상 (소리 없이 자동 재생)
// StorePage가 영상 끝나기 전까지 씀
import { STORE_ASSETS } from "../../../shared/constants/storeAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 영상 끝 감지는 StorePage의 useVideoIntro가 videoRef로 함
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
