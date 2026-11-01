// 카드 틀 모양대로 테마 색 테두리 (틀 그림을 마스크로 써서 살짝 키움)
// PreviewCard가 씀 (데스크톱 InGamePlayerFrameStroke와 같은 모양)
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 틀 뒤에 깔리는 색 판, scale만큼 틀 밖으로 비어져 나와 테두리처럼 보임
export default function FrameStroke({ frameSrc, color, scale = 1.026 }) {
  const maskImage = `url("${publicAsset(frameSrc)}")`

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 origin-center"
      style={{
        WebkitMaskImage: maskImage,
        maskImage,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        backgroundColor: color,
        transform: `scale(${scale})`,
      }}
    />
  )
}
