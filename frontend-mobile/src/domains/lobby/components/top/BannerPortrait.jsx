// 배너 초상 (장착한 프로필 사진·테두리)
// ProfileBanner가 씀
import { useProfileCustomizationStore } from "@/domains/user/store/profileCustomization.store.js"
import {
    LOBBY_BANNER_PROFILE_LAYOUT,
    LOBBY_BANNER_PROFILE_PHOTO_INSET,
    PROFILE_FRAME_CLASS,
    PROFILE_IMG_CLASS,
    PROFILE_IMG_WRAP_CLASS,
    PROFILE_WRAP_CLASS,
} from "@/domains/user/constants/myPageBannerStyle.js"
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 꾸미기 스토어 값이 없으면 기본 그림 (지갑 요약 받기는 useWallet이 맡음)
export default function BannerPortrait() {
    const storePhoto = useProfileCustomizationStore((state) => state.photoSrc)
    const storeFrame = useProfileCustomizationStore((state) => state.frameSrc)

    const photoSrc = storePhoto ?? PLAYER_PROFILE_ASSETS.defaultPhoto
    const frameSrc = storeFrame ?? PLAYER_PROFILE_ASSETS.defaultBorder

    return (
        <span className={PROFILE_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_LAYOUT}>
            <span className={PROFILE_IMG_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_PHOTO_INSET}>
                <PublicAsset src={photoSrc} alt="" className={PROFILE_IMG_CLASS} />
            </span>
            <PublicAsset src={frameSrc} alt="" className={PROFILE_FRAME_CLASS} />
        </span>
    )
}
