// 사용자 화면 공통 틀 (마이페이지 배경 그림 + 위 줄 + 본문)
// MyPage·AccountPage가 씀, 데스크톱 UserPageBackground·UserPageChrome 자리

import { motion } from "framer-motion"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import TopBar from "./TopBar.jsx"

const MotionAsset = motion.create(PublicAsset)

// 배경은 화면에 고정, 본문만 스크롤
export default function ScreenFrame({ title, onBack, children }) {
    return (
        <div className="relative flex min-h-full flex-col">
            <MotionAsset
                src={MY_PAGE_ASSETS.bg}
                alt=""
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={BG_FADE_TRANSITION}
                className="pointer-events-none fixed inset-0 z-0 h-full w-full select-none object-cover object-bottom"
            />
            {/* 그림 위 글자가 읽히게 살짝 어둡게 */}
            <div className="pointer-events-none fixed inset-0 z-0 bg-black/35" aria-hidden="true" />

            <TopBar title={title} onBack={onBack} />

            <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
    )
}
