import { motion } from "framer-motion"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset"

// 마이페이지/계정 관리 페이지처럼 user 도메인 화면 뒤에 깔리는 공통 배경입니다.
export default function UserPageBackground() {
  return (
    <motion.img
      src={publicAsset(MY_PAGE_ASSETS.bg)}
      alt=""
      // 페이지에 들어왔을 때 배경이 부드럽게 나타나게 합니다.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BG_FADE_TRANSITION}
      className="pointer-events-none absolute inset-x-0 bottom-0 top-0 h-full min-h-full w-full object-cover object-bottom"
      draggable={false}
    />
  )
}
