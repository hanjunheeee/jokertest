// 운명의 가면 틀 (틀 그림 + 설명 한 줄, 화면 읽기에서는 숨김)
// MyPageLayout이 씀
import { motion } from "framer-motion"
import { FATE_MASK_DESCRIPTION, MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import FateMaskDescription from "./FateMaskDescription.jsx"
import {
  FATE_MASK_FOOTER_CLASS,
  FATE_MASK_FRAME_IMG_CLASS,
  FATE_MASK_FRAME_WRAP_CLASS,
  FATE_MASK_UI_FADE,
} from "../constants/myPageLayoutStyle.js"
import PublicAsset from "../../../shared/ui/PublicAsset.jsx"

// 나타나는 움직임만 있고 누를 것 없음
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
        <PublicAsset src={src} alt="" className={className} />

        {showText ? <FateMaskDescription description={description} /> : null}
      </div>
    </motion.footer>
  )
}
