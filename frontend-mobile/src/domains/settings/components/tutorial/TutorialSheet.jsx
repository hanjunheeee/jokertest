// 튜토리얼 창 (어두운 뒤판·슬라이드 그림·페이지 이동 줄, body에 포털), 데스크톱 튜토리얼 창과 같은 모양
// tabs/GeneralTab.jsx가 "다시 보기"로 엶
import { motion } from "framer-motion"
import { TUTORIAL_GUIDE_SLIDES } from "@/shared/constants/tutorialAssets.js"
import { useTutorialPager } from "@/shared/hooks/useTutorialPager.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import { useSwipe } from "../../hooks/useSwipe.js"
import TutorialPager from "./TutorialPager.jsx"

const GUIDE_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

// 뒤판·창 자리 (데스크톱 tutorialGuideLayout 색 그대로, 폭·높이만 폰에 맞춤)
const BACKDROP_CLASS = "fixed inset-0 z-[100] cursor-pointer border-0 bg-black/82 p-0"
const SHELL_CLASS =
    "pointer-events-none fixed inset-0 z-[101] flex items-center justify-center px-3 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
const PANEL_CLASS = "pointer-events-auto flex max-h-full w-full max-w-5xl flex-col items-stretch gap-3 land:gap-1"
const SLIDE_WRAP_CLASS =
    "relative flex min-h-0 flex-1 touch-pan-y select-none items-center justify-center overflow-hidden rounded-sm bg-black/35"

// 데스크톱처럼 뒤판 누르면 닫음, 페이지·Esc·화살표 키는 데스크톱 useTutorialPager, 폰은 쓸기로도 넘김
export default function TutorialSheet({ open, onClose, slides = TUTORIAL_GUIDE_SLIDES }) {
    const count = slides.length
    const { mounted, pageIndex, setPageIndex } = useTutorialPager({ open, onClose, slideCount: count })
    const swipe = useSwipe({
        onLeft: () => setPageIndex((prev) => Math.min(count - 1, prev + 1)),
        onRight: () => setPageIndex((prev) => Math.max(0, prev - 1)),
    })

    if (!mounted || count === 0) return null

    return (
        <SheetPortal open={open}>
            <motion.button
                key="backdrop"
                type="button"
                aria-label="튜토리얼 닫기"
                data-sfx-kind="ui-cancel"
                className={BACKDROP_CLASS}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={GUIDE_TRANSITION}
                onClick={onClose}
            />

            <div key="shell" className={SHELL_CLASS}>
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="게임 플레이 튜토리얼"
                    className={PANEL_CLASS}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={GUIDE_TRANSITION}
                >
                    {/* 그림 칸: 옆으로 쓸면 넘김, 가로 그림 그대로 */}
                    <div {...swipe} className={SLIDE_WRAP_CLASS}>
                        <img
                            src={publicAsset(slides[pageIndex])}
                            alt={`튜토리얼 ${pageIndex + 1}페이지`}
                            className="block max-h-[72svh] w-full select-none object-contain object-center land:max-h-[calc(100svh-5.5rem)]"
                            draggable={false}
                        />
                    </div>

                    <TutorialPager count={count} pageIndex={pageIndex} setPageIndex={setPageIndex} />
                </motion.div>
            </div>
        </SheetPortal>
    )
}
