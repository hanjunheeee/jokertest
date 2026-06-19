import { motion } from "framer-motion"
import {
  FATE_MASK_DESCRIPTION,
  MY_PAGE_ASSETS,
} from "../constants/myPageAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const UI_FADE = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }

const TEXT_SHADOW =
  "0 1px 2px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.55)"

/** 어두운 본문 박스 영역 (프레임 PNG 기준) */
const DESCRIPTION_INSET = {
  top: "55.5%",
  bottom: "20%",
  left: "14%",
  right: "14%",
}

const FATE_MASK_FRAME_WRAP_CLASS =
  "relative mx-auto w-[min(100%,clamp(26rem,68cqw,34rem))] [container-type:inline-size]"

/**
 * 마이페이지 하단 고정 운명의 가면 프레임
 */
export default function FateMaskFooter({
  src = MY_PAGE_ASSETS.fateMaskFrame,
  description = FATE_MASK_DESCRIPTION,
  showText = true,
  className = "block h-auto w-full select-none",
}) {
  const { prefix, highlight, suffix } = description

  return (
    <motion.footer
      className="pointer-events-none z-[15] flex w-full shrink-0 justify-center px-[clamp(0.5rem,2cqw,1rem)] pb-[clamp(0.75rem,2vh,1.25rem)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={UI_FADE}
      aria-hidden="true"
    >
      {/* cqw = 게임 영역 기준 — vw·w-full보다 작고, 모서리 장식은 30rem대보다 넓게 */}
      <div className={FATE_MASK_FRAME_WRAP_CLASS}>
        <PublicAsset src={src} alt="" className={className} />

        {showText ? (
          <p
            className="pointer-events-none absolute flex items-end justify-center pb-[0.18em] text-center font-subheading text-[3.1cqi] font-bold leading-[1.55] text-[#e8e4dc]"
            style={{ ...DESCRIPTION_INSET, textShadow: TEXT_SHADOW }}
          >
            <span>
              {prefix}{" "}
              <span className="text-[#e8c878] [text-shadow:0_0_10px_rgba(232,200,120,0.45)]">
                [{highlight}]
              </span>
              {suffix}
            </span>
          </p>
        ) : null}
      </div>
    </motion.footer>
  )
}
