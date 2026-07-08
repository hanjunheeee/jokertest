import { publicAsset } from "@/shared/utils/publicAsset"

function buildFrameMaskStyle(frameSrc) {
  const maskImage = publicAsset(frameSrc)

  return {
    WebkitMaskImage: `url("${maskImage}")`,
    maskImage: `url("${maskImage}")`,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  }
}

/**
 * 프레임 PNG 실루엣 stroke — mask 레이어를 살짝 키워 뒤에 깔고, 위에 원본 프레임을 올립니다.
 */
export default function InGamePlayerFrameStroke({ frameSrc, color, scale = 1.026 }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 origin-center"
      style={{
        ...buildFrameMaskStyle(frameSrc),
        backgroundColor: color,
        transform: `scale(${scale})`,
      }}
    />
  )
}
