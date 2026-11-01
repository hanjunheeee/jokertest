// 프로필 띠 초상 (장착한 프로필 사진 + 테두리)
// ProfileCard가 씀, 데스크톱 BannerProfilePortrait와 같은 스토어·자리 값

import { useEffect } from "react"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import {
    LOBBY_BANNER_PROFILE_LAYOUT,
    LOBBY_BANNER_PROFILE_PHOTO_INSET,
    PROFILE_FRAME_CLASS,
    PROFILE_IMG_CLASS,
    PROFILE_IMG_WRAP_CLASS,
    PROFILE_WRAP_CLASS,
} from "@/domains/user/constants/myPageBannerStyle.js"
import { useProfileCustomizationStore } from "@/domains/user/store/profileCustomization.store.js"
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 처음 그릴 때 지갑 요약을 받아 장착값을 꾸미기 스토어로 들임
export default function Portrait() {
    const photoSrc = useProfileCustomizationStore((s) => s.photoSrc) ?? PLAYER_PROFILE_ASSETS.defaultPhoto
    const frameSrc = useProfileCustomizationStore((s) => s.frameSrc) ?? PLAYER_PROFILE_ASSETS.defaultBorder

    useEffect(() => {
        useEconomyStore.getState().fetchSummary()
    }, [])

    return (
        <div className={PROFILE_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_LAYOUT}>
            <div className={PROFILE_IMG_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_PHOTO_INSET}>
                <PublicAsset src={photoSrc} alt="" className={PROFILE_IMG_CLASS} />
            </div>
            <PublicAsset src={frameSrc} alt="" className={PROFILE_FRAME_CLASS} />
        </div>
    )
}
