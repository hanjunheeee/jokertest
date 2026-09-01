import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  TUTORIAL_GUIDE_ARROW,
  TUTORIAL_GUIDE_SLIDES,
} from "@/shared/constants/tutorialAssets.js"
import {
  TUTORIAL_GUIDE_ARROW_BTN_CLASS,
  TUTORIAL_GUIDE_ARROW_IMG_CLASS,
  TUTORIAL_GUIDE_BACKDROP_CLASS,
  TUTORIAL_GUIDE_CONTROLS_CLASS,
  TUTORIAL_GUIDE_NODE_ACTIVE_CLASS,
  TUTORIAL_GUIDE_NODE_BASE_CLASS,
  TUTORIAL_GUIDE_NODES_CLASS,
  TUTORIAL_GUIDE_PANEL_CLASS,
  TUTORIAL_GUIDE_SHELL_CLASS,
  TUTORIAL_GUIDE_SLIDE_IMAGE_CLASS,
  TUTORIAL_GUIDE_SLIDE_WRAP_CLASS,
  TUTORIAL_GUIDE_TRANSITION,
} from "@/shared/ui/tutorialGuide/tutorialGuideLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { publicAsset } from "@/shared/utils/publicAsset"

/** 게임 플레이 튜토리얼/도움말 슬라이드(PPT) 전역 오버레이 */
export default function TutorialGuideOverlay({
  open,
  onClose,
  slides = TUTORIAL_GUIDE_SLIDES,
  ariaLabel = "게임 플레이 튜토리얼",
}) {
  const [mounted, setMounted] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)

  const slideCount = slides.length
  const canGoPrev = pageIndex > 0
  const canGoNext = pageIndex < slideCount - 1

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) setPageIndex(0)
  }, [open])

  useEffect(() => {
    if (!open || slideCount === 0) return undefined

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (event.key === "ArrowLeft") {
        setPageIndex((prev) => Math.max(0, prev - 1))
      }
      if (event.key === "ArrowRight") {
        setPageIndex((prev) => Math.min(slideCount - 1, prev + 1))
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, slideCount])

  if (!mounted || slideCount === 0) return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="튜토리얼 닫기"
            className={TUTORIAL_GUIDE_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TUTORIAL_GUIDE_TRANSITION}
            onClick={onClose}
          />

          <div className={TUTORIAL_GUIDE_SHELL_CLASS}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              className={TUTORIAL_GUIDE_PANEL_CLASS}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={TUTORIAL_GUIDE_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={TUTORIAL_GUIDE_SLIDE_WRAP_CLASS}>
                <img
                  src={publicAsset(slides[pageIndex])}
                  alt={`튜토리얼 ${pageIndex + 1}페이지`}
                  className={TUTORIAL_GUIDE_SLIDE_IMAGE_CLASS}
                  draggable={false}
                />
              </div>

              <div className={TUTORIAL_GUIDE_CONTROLS_CLASS} aria-label="튜토리얼 페이지 이동">
                <button
                  type="button"
                  aria-label="이전 페이지"
                  disabled={!canGoPrev}
                  onClick={() => setPageIndex((prev) => prev - 1)}
                  className={TUTORIAL_GUIDE_ARROW_BTN_CLASS}
                >
                  <PublicAsset
                    src={TUTORIAL_GUIDE_ARROW}
                    alt=""
                    className={TUTORIAL_GUIDE_ARROW_IMG_CLASS}
                  />
                </button>

                <div className={TUTORIAL_GUIDE_NODES_CLASS} role="tablist" aria-label="페이지 선택">
                  {slides.map((_, index) => {
                    const active = index === pageIndex
                    return (
                      <button
                        key={index}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-label={`${index + 1}페이지`}
                        onClick={() => setPageIndex(index)}
                        className={`${TUTORIAL_GUIDE_NODE_BASE_CLASS}${
                          active ? ` ${TUTORIAL_GUIDE_NODE_ACTIVE_CLASS}` : ""
                        }`}
                      />
                    )
                  })}
                </div>

                <button
                  type="button"
                  aria-label="다음 페이지"
                  disabled={!canGoNext}
                  onClick={() => setPageIndex((prev) => prev + 1)}
                  className={TUTORIAL_GUIDE_ARROW_BTN_CLASS}
                >
                  <PublicAsset
                    src={TUTORIAL_GUIDE_ARROW}
                    alt=""
                    className={`${TUTORIAL_GUIDE_ARROW_IMG_CLASS} rotate-180`}
                  />
                </button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
