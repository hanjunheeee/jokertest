// 이모티콘 팔레트 화면 (안내 줄·보유 이모티콘·팔레트 바퀴·저장 완료 창, 상태는 useEmoticonPalettePage)
// 라우터가 /mypage/emoticons 경로에 씀
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"

import EmoticonInventorySection from "@/domains/user/components/emoticonPalette/EmoticonInventorySection.jsx"
import EmoticonPaletteSaveSuccessModal from "@/domains/user/components/emoticonPalette/EmoticonPaletteSaveSuccessModal.jsx"
import EmoticonPaletteStatus from "@/domains/user/components/emoticonPalette/EmoticonPaletteStatus.jsx"
import EmoticonWheelSection from "@/domains/user/components/emoticonPalette/EmoticonWheelSection.jsx"
import UserPageBackground from "@/domains/user/components/UserPageBackground.jsx"
import UserPageChrome from "@/domains/user/components/UserPageChrome.jsx"
import {
  BODY_CLASS,
  CONTENT_CLASS,
  MAIN_CLASS,
  ROOT_CLASS,
  UI_FADE,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { useEmoticonPalettePage } from "@/domains/user/hooks/useEmoticonPalettePage.js"

export default function EmoticonPalettePage() {
  const navigate = useNavigate()
  const page = useEmoticonPalettePage()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <UserPageBackground />

      <div className={ROOT_CLASS}>
        <motion.main
          className={MAIN_CLASS}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={UI_FADE}
        >
          <div className={CONTENT_CLASS}>
            <EmoticonPaletteStatus
              status={page.status}
              conflict={page.conflict}
              notice={page.notice}
              onRetry={page.load}
            />

            <div className={BODY_CLASS}>
              <EmoticonInventorySection page={page} />
              <EmoticonWheelSection page={page} />
            </div>
          </div>
        </motion.main>
      </div>

      <UserPageChrome onBack={() => navigate("/mypage")} />

      <EmoticonPaletteSaveSuccessModal
        open={page.saveSuccessOpen}
        onDismiss={() => page.setSaveSuccessOpen(false)}
      />
    </div>
  )
}
