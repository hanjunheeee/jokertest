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
