// 사용자 화면 배경 그림 (서서히 나타남)
// 마이페이지·계정·이모티콘 팔레트 화면이 씀
import { motion } from "framer-motion"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset"

// 끌기 막고 누름이 통과하게 둠
export default function UserPageBackground() {
  return (
    <motion.img
      src={publicAsset(MY_PAGE_ASSETS.bg)}
      alt=""
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BG_FADE_TRANSITION}
      className="pointer-events-none absolute inset-x-0 bottom-0 top-0 h-full min-h-full w-full object-cover object-bottom"
      draggable={false}
    />
  )
}
