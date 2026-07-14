import { motion } from "framer-motion"
import { FATE_MASK_DESCRIPTION, MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import FateMaskDescription from "@/domains/user/components/FateMaskFooter/FateMaskDescription.jsx"
import {
  FATE_MASK_FRAME_IMG_CLASS,
  FATE_MASK_FRAME_WRAP_CLASS,
  FATE_MASK_UI_FADE,
} from "@/domains/user/constants/fateMaskFooterStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 마이페이지 하단의 "운명의 가면" 프레임을 그리는 컴포넌트입니다.
// 프레임 이미지는 여기서 그리고, 안쪽 설명 문장은 FateMaskDescription이 담당합니다.
export default function FateMaskFooter({
  src = MY_PAGE_ASSETS.fateMaskFrame,
  description = FATE_MASK_DESCRIPTION,
  showText = true,
  className = FATE_MASK_FRAME_IMG_CLASS,
}) {
  return (
    <motion.footer
      className="pointer-events-none z-[15] flex w-full shrink-0 justify-center px-[clamp(0.5rem,2cqw,1rem)] pb-[clamp(0.75rem,2vh,1.25rem)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={FATE_MASK_UI_FADE}
      aria-hidden="true"
    >
      <div className={FATE_MASK_FRAME_WRAP_CLASS}>
        {/* 운명의 가면 배경 프레임 이미지입니다. */}
        <PublicAsset src={src} alt="" className={className} />

        {/* showText가 true일 때만 프레임 위에 설명 문장을 올립니다. */}
        {showText ? <FateMaskDescription description={description} /> : null}
      </div>
    </motion.footer>
  )
}
