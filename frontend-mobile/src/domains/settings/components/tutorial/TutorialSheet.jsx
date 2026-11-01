// 튜토리얼 전체 화면 시트 (닫기·슬라이드 그림·쓸어 넘기기·페이지 이동 줄, body에 포털)
// tabs/GeneralTab.jsx가 "다시 보기"로 엶
import { motion } from "framer-motion"
import { TUTORIAL_GUIDE_SLIDES } from "@/shared/constants/tutorialAssets.js"
import { useTutorialPager } from "@/shared/hooks/useTutorialPager.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import { useSwipe } from "../../hooks/useSwipe.js"
import TutorialPager from "./TutorialPager.jsx"

const GUIDE_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

// 페이지·Esc·화살표 키는 데스크톱 useTutorialPager, 폰은 쓸기로도 넘김
export default function TutorialSheet({ open, onClose, slides = TUTORIAL_GUIDE_SLIDES }) {
    const count = slides.length
    const { mounted, pageIndex, setPageIndex } = useTutorialPager({ open, onClose, slideCount: count })
    const swipe = useSwipe({
        onLeft: () => setPageIndex((prev) => Math.min(count - 1, prev + 1)),
        onRight: () => setPageIndex((prev) => Math.max(0, prev - 1)),
    })

    if (!mounted || count === 0) return null

    // Esc·화살표 키는 useTutorialPager가 받아서 SheetPortal엔 onClose 안 넘김
    return (
        <SheetPortal open={open}>
            <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="게임 플레이 튜토리얼"
                className="fixed inset-0 z-[100] flex flex-col bg-black/95"
                style={{
                    padding:
                        "env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)",
                }}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={GUIDE_TRANSITION}
            >
                <div className="flex h-14 shrink-0 items-center justify-between px-4">
                    <span className="font-subheading text-sm font-bold text-[#f5e6c8]/80 tabular-nums">
                        {pageIndex + 1} / {count}
                    </span>
                    <button
                        type="button"
                        aria-label="튜토리얼 닫기"
                        data-sfx-kind="ui-cancel"
                        onClick={onClose}
                        className="flex size-12 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-3xl leading-none text-[#f5e6c8]"
                    >
                        ×
                    </button>
                </div>

                {/* 그림 칸: 옆으로 쓸면 넘김, 세로 스크롤은 막지 않음 */}
                <div
                    {...swipe}
                    className="flex min-h-0 flex-1 touch-pan-y select-none items-center justify-center px-2"
                >
                    <img
                        src={publicAsset(slides[pageIndex])}
                        alt={`튜토리얼 ${pageIndex + 1}페이지`}
                        className="block max-h-full w-full max-w-5xl object-contain"
                        draggable={false}
                    />
                </div>

                <div className="shrink-0 px-2 pb-3 land:pb-1">
                    <TutorialPager count={count} pageIndex={pageIndex} setPageIndex={setPageIndex} />
                </div>
            </motion.div>
        </SheetPortal>
    )
}
