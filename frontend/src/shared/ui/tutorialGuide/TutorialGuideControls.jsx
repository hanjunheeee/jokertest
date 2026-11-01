// 튜토리얼 창 아래 페이지 이동 줄 (이전 화살표·페이지 점·다음 화살표)
// TutorialGuideOverlay가 씀
import { TUTORIAL_GUIDE_ARROW } from "@/shared/constants/tutorialAssets.js"
import {
  ARROW_BTN_CLASS,
  ARROW_IMG_CLASS,
  CONTROLS_CLASS,
  NODE_ACTIVE_CLASS,
  NODE_BASE_CLASS,
  NODES_CLASS,
} from "@/shared/ui/tutorialGuide/tutorialGuideLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 첫·마지막 페이지에서는 화살표를 잠금, 다음 화살표는 같은 그림을 뒤집어 씀
export default function TutorialGuideControls({ slides, pageIndex, setPageIndex }) {
  const slideCount = slides.length
  const canGoPrev = pageIndex > 0
  const canGoNext = pageIndex < slideCount - 1

  return (
    <div className={CONTROLS_CLASS} aria-label="튜토리얼 페이지 이동">
      <button
        type="button"
        aria-label="이전 페이지"
        disabled={!canGoPrev}
        onClick={() => setPageIndex((prev) => prev - 1)}
        className={ARROW_BTN_CLASS}
      >
        <PublicAsset
          src={TUTORIAL_GUIDE_ARROW}
          alt=""
          className={ARROW_IMG_CLASS}
        />
      </button>

      <div className={NODES_CLASS} role="tablist" aria-label="페이지 선택">
        {/* 점을 누르면 그 페이지로 바로 감 */}
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
              className={`${NODE_BASE_CLASS}${
                active ? ` ${NODE_ACTIVE_CLASS}` : ""
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
        className={ARROW_BTN_CLASS}
      >
        <PublicAsset
          src={TUTORIAL_GUIDE_ARROW}
          alt=""
          className={`${ARROW_IMG_CLASS} rotate-180`}
        />
      </button>
    </div>
  )
}
