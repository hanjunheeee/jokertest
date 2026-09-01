import { motion } from "framer-motion"
import { FATE_MASK_DESCRIPTION, MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import FateMaskDescription from "@/domains/user/components/FateMaskFooter/FateMaskDescription.jsx"
import {
  FATE_MASK_FOOTER_CLASS,
  FATE_MASK_FRAME_IMG_CLASS,
  FATE_MASK_FRAME_WRAP_CLASS,
  FATE_MASK_UI_FADE,
} from "@/domains/user/constants/myPageLayoutStyle.js"
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
      className={FATE_MASK_FOOTER_CLASS}
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
