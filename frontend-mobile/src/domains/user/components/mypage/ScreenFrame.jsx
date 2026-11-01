// 사용자 화면 공통 틀 (마이페이지 배경 그림 + 위 줄 + 본문)
// MyPage·AccountPage가 씀, 데스크톱 UserPageBackground·UserPageChrome 자리

import { motion } from "framer-motion"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import SoundMenu from "@m/shared/ui/sound/SoundMenu.jsx"
import TopBar from "@m/shared/ui/top/TopBar.jsx"

// 위 줄: 스크롤해도 붙어 있음, 가로 화면에서도 높이 그대로, 데스크톱처럼 덮개 없음
const BAR_CLASS =
    "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 px-3"

const MotionAsset = motion.create(PublicAsset)

// 배경은 화면에 고정, 본문만 스크롤 (데스크톱처럼 배경 덮개 없음)
// 제목은 데스크톱 화면에 없는 글이라 화면 읽기용으로만 둠
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

            <TopBar
                onBack={onBack}
                className={BAR_CLASS}
                backIconClassName="block h-full w-full select-none object-contain"
                title={<h1 className="sr-only">{title}</h1>}
                right={<SoundMenu look="user" />}
            />

            <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
    )
}
