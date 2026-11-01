// 튜토리얼 시트 아래 페이지 이동 줄 (이전 화살표·페이지 점·다음 화살표)
// tutorial/TutorialSheet.jsx가 씀
import { TUTORIAL_GUIDE_ARROW } from "@/shared/constants/tutorialAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const ARROW_BTN_CLASS =
    "flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-default disabled:opacity-25"

// 점은 그림 10px, 누르는 칸은 44px (5장이면 360 폭에도 한 줄)
const DOT_BTN_CLASS = "flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"

// 첫·마지막 페이지에선 화살표 잠금, 다음 화살표는 같은 그림을 뒤집어 씀
export default function TutorialPager({ count, pageIndex, setPageIndex }) {
    return (
        <div className="flex shrink-0 items-center justify-center gap-1" aria-label="튜토리얼 페이지 이동">
            <button
                type="button"
                aria-label="이전 페이지"
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((prev) => prev - 1)}
                className={ARROW_BTN_CLASS}
            >
                <PublicAsset src={TUTORIAL_GUIDE_ARROW} alt="" className="block h-auto w-12 select-none" />
            </button>

            <div className="flex min-w-0 flex-wrap items-center justify-center" role="tablist" aria-label="페이지 선택">
                {Array.from({ length: count }, (_, index) => {
                    const active = index === pageIndex
                    return (
                        <button
                            key={index}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-label={`${index + 1}페이지`}
                            onClick={() => setPageIndex(index)}
                            className={DOT_BTN_CLASS}
                        >
                            <span
                                className={`block size-2.5 rounded-full border border-[#e8dcc8]/55 ${
                                    active ? "border-[#f5e6c8] bg-[#f5e6c8] shadow-[0_0_0.35rem_rgba(245,230,200,0.45)]" : ""
                                }`}
                            />
                        </button>
                    )
                })}
            </div>

            <button
                type="button"
                aria-label="다음 페이지"
                disabled={pageIndex >= count - 1}
                onClick={() => setPageIndex((prev) => prev + 1)}
                className={ARROW_BTN_CLASS}
            >
                <PublicAsset src={TUTORIAL_GUIDE_ARROW} alt="" className="block h-auto w-12 rotate-180 select-none" />
            </button>
        </div>
    )
}
