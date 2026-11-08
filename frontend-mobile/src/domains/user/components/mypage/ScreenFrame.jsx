// 사용자 화면 공통 틀 (마이페이지 배경 그림 + 위 줄 + 본문)
// MyPage·AccountPage·EmoticonPalettePage가 씀, 데스크톱 UserPageBackground·UserPageChrome 자리

import { motion } from "framer-motion"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import BottomBackFixed from "@m/shared/ui/button/BottomBackFixed.jsx"
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import SoundMenu from "@m/shared/ui/sound/SoundMenu.jsx"
import TopBar from "@m/shared/ui/top/TopBar.jsx"
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 위 줄: 스크롤해도 붙어 있음, 가로 화면에서도 높이 그대로, 데스크톱처럼 덮개 없음
const BAR_CLASS =
    "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 px-3"

const MotionAsset = motion.create(PublicAsset)

// 배경은 화면에 고정, 본문만 스크롤 (데스크톱처럼 배경 덮개 없음)
// 제목은 데스크톱 화면에 없는 글이라 화면 읽기용으로만 둠
const TOP_CLOSE_BTN_CLASS =
    "interactive-scale fixed z-40 right-3 top-[max(0.65rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0 land:top-2"

const TOP_CLOSE_ICON_CLASS = "block h-10 w-10 select-none object-contain"

// backAtBottom: 우하단 뒤로 (마이페이지·계정관리), closeAtTopRight: 우상단 닫기 (이모티콘)
// fillViewport: 본문만 스크롤(이모티콘 목록 등), 틀 바깥 mobile-shell__page는 안 움직임
export default function ScreenFrame({
    title,
    onBack,
    children,
    backAtBottom = false,
    closeAtTopRight = false,
    fillViewport = false,
}) {
    const hideBack = backAtBottom || closeAtTopRight

    const handleTopClose = () => {
        dispatchUiSfx("ui-cancel")
        onBack?.()
    }

    return (
        <div
            className={`relative flex flex-col ${fillViewport ? "h-full min-h-0 overflow-hidden" : "min-h-full"}`}
        >
            <MotionAsset
                src={MY_PAGE_ASSETS.bg}
                alt=""
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={BG_FADE_TRANSITION}
                className="pointer-events-none fixed inset-0 z-0 h-full w-full select-none object-cover object-bottom"
            />

            <TopBar
                onBack={onBack}
                hideBack={hideBack}
                className={`${BAR_CLASS} ${closeAtTopRight ? "pr-14 land:pr-[3.75rem]" : ""}`}
                backIconClassName="block h-full w-full select-none object-contain"
                title={<h1 className="sr-only">{title}</h1>}
                right={<SoundMenu look="user" />}
            />

            <div
                className={`relative z-10 flex min-h-0 flex-1 flex-col ${fillViewport ? "overflow-hidden" : ""}`}
            >
                {children}
            </div>

            {closeAtTopRight && onBack ? (
                <CloseButton
                    label={`${title} 닫기`}
                    onClick={handleTopClose}
                    src={SKIN_CARD_WEAR_ASSETS.popupCloseButton}
                    data-sfx-owner="explicit"
                    className={TOP_CLOSE_BTN_CLASS}
                    iconClassName={TOP_CLOSE_ICON_CLASS}
                />
            ) : null}

            {backAtBottom ? <BottomBackFixed onClick={onBack} /> : null}
        </div>
    )
}
