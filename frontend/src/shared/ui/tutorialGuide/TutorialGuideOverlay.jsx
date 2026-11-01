// 튜토리얼 창 (어두운 뒤판·슬라이드 그림·페이지 이동 줄, body에 포털로 띄움)
// 일반 설정 탭이 씀
import { AnimatePresence, motion } from "framer-motion"
import { createPortal } from "react-dom"
import { TUTORIAL_GUIDE_SLIDES } from "@/shared/constants/tutorialAssets.js"
import {
  BACKDROP_CLASS,
  PANEL_CLASS,
  SHELL_CLASS,
  SLIDE_IMG_CLASS,
  SLIDE_WRAP_CLASS,
  GUIDE_TRANSITION,
} from "@/shared/ui/tutorialGuide/tutorialGuideLayout.js"
import TutorialGuideControls from "@/shared/ui/tutorialGuide/TutorialGuideControls.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"
import { useTutorialPager } from "@/shared/hooks/useTutorialPager.js"

// 뒤판을 누르면 닫고, 창 안 클릭은 뒤판까지 번지지 않게 막음
export default function TutorialGuideOverlay({
  open,
  onClose,
  slides = TUTORIAL_GUIDE_SLIDES,
  ariaLabel = "게임 플레이 튜토리얼",
}) {
  const slideCount = slides.length
  const { mounted, pageIndex, setPageIndex } = useTutorialPager({ open, onClose, slideCount })

  if (!mounted || slideCount === 0) return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="튜토리얼 닫기"
            className={BACKDROP_CLASS}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={GUIDE_TRANSITION}
            onClick={onClose}
          />

          <div className={SHELL_CLASS}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              className={PANEL_CLASS}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={GUIDE_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={SLIDE_WRAP_CLASS}>
                <img
                  src={publicAsset(slides[pageIndex])}
                  alt={`튜토리얼 ${pageIndex + 1}페이지`}
                  className={SLIDE_IMG_CLASS}
                  draggable={false}
                />
              </div>

              <TutorialGuideControls slides={slides} pageIndex={pageIndex} setPageIndex={setPageIndex} />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
