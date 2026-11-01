// 프로필 띠 초상 (장착한 프로필 사진 + 테두리, 꾸미기 스토어 값)
// 로비 ProfileBanner·마이페이지 ProfileCard가 씀, 데스크톱 BannerProfilePortrait와 같은 자리 값
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

// 값 없으면 기본 그림, as는 감싸는 태그 (버튼 안이면 span)
export default function BannerPortrait({ as: Wrap = "span" }) {
  const photoSrc = useProfileCustomizationStore((state) => state.photoSrc) ?? PLAYER_PROFILE_ASSETS.defaultPhoto
  const frameSrc = useProfileCustomizationStore((state) => state.frameSrc) ?? PLAYER_PROFILE_ASSETS.defaultBorder

  return (
    <Wrap className={PROFILE_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_LAYOUT}>
      <Wrap className={PROFILE_IMG_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_PHOTO_INSET}>
        <PublicAsset src={photoSrc} alt="" className={PROFILE_IMG_CLASS} />
      </Wrap>
      <PublicAsset src={frameSrc} alt="" className={PROFILE_FRAME_CLASS} />
    </Wrap>
  )
}
