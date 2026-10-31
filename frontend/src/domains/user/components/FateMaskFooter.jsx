import { motion } from "framer-motion"
import { FATE_MASK_DESCRIPTION, MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import FateMaskDescription from "./FateMaskFooter/FateMaskDescription.jsx"
import {
  FATE_MASK_FOOTER_CLASS,
  FATE_MASK_FRAME_IMG_CLASS,
  FATE_MASK_FRAME_WRAP_CLASS,
  FATE_MASK_UI_FADE,
} from "../constants/myPageLayoutStyle.js"
import PublicAsset from "../../../shared/ui/PublicAsset.jsx"

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
