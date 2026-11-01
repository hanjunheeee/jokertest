// 마이페이지 위 프로필 띠 (배너 틀 + 초상 + 닉네임, 데스크톱 MyPageBannerButton 초상 켠 모양)
// MyPage가 씀

import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import {
    BANNER_FRAME_IMG_CLASS,
    LOBBY_TEXT_PANEL_INSET,
    TEXT_SHADOW,
} from "@/domains/user/constants/myPageBannerStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import Portrait from "./Portrait.jsx"

// 초상이 틀 위로 조금 튀어나와서 위 여백을 둠, 누를 것 없음
export default function ProfileCard({ profile }) {
    return (
        <div className="relative mt-3 w-full [container-type:inline-size]">
            <PublicAsset src={MY_PAGE_ASSETS.myPageButtonFrame} alt="" className={BANNER_FRAME_IMG_CLASS} />

            <Portrait />

            <div className="pointer-events-none absolute flex items-center" style={LOBBY_TEXT_PANEL_INSET}>
                <p
                    className="relative left-[-4%] max-w-full truncate font-subheading text-[max(1rem,5.2cqi)] font-bold leading-tight text-[#ebe2cc]"
                    style={{ textShadow: TEXT_SHADOW }}
                >
                    {profile.nickname}
                </p>
            </div>
        </div>
    )
}
