// 마이페이지 위 프로필 띠 (배너 틀 + 초상 + 닉네임, 데스크톱 MyPageBannerButton 초상 켠 모양)
// MyPage가 씀, 처음 그릴 때 지갑 요약을 받아 장착값을 꾸미기 스토어로 들임

import { useEffect } from "react"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import {
    BANNER_FRAME_IMG_CLASS,
    LABEL_TEXT_CLASS,
    LOBBY_TEXT_PANEL_INSET,
    ROOT_CLASS,
    TEXT_ALIGN_LEFT_CLASS,
    TEXT_SHADOW,
} from "@/domains/user/constants/myPageBannerStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import BannerPortrait from "@m/shared/ui/portrait/BannerPortrait.jsx"

// 초상이 틀 위로 조금 튀어나와서 위 여백을 둠, 누를 것 없음 (데스크톱도 마이페이지 띠는 칸)
export default function ProfileCard({ profile }) {
    useEffect(() => {
        useEconomyStore.getState().fetchSummary()
    }, [])

    return (
        <div className={`${ROOT_CLASS} mt-3 w-full`}>
            <PublicAsset src={MY_PAGE_ASSETS.myPageButtonFrame} alt="" className={BANNER_FRAME_IMG_CLASS} />

            <BannerPortrait as="div" />

            <div className="pointer-events-none absolute flex items-center" style={LOBBY_TEXT_PANEL_INSET}>
                <p
                    className={`relative ${TEXT_ALIGN_LEFT_CLASS} max-w-full [overflow-wrap:anywhere] ${LABEL_TEXT_CLASS}`}
                    style={{ textShadow: TEXT_SHADOW }}
                >
                    {profile.nickname}
                </p>
            </div>
        </div>
    )
}
