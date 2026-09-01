import {
  LOBBY_BANNER_PROFILE_LAYOUT,
  LOBBY_BANNER_PROFILE_PHOTO_INSET,
  MY_PAGE_BANNER_PROFILE_FRAME_CLASS,
  MY_PAGE_BANNER_PROFILE_IMAGE_CLASS,
  MY_PAGE_BANNER_PROFILE_IMAGE_WRAP_CLASS,
  MY_PAGE_BANNER_PROFILE_WRAP_CLASS,
} from "@/domains/user/constants/myPageBannerStyle.js"
import { useProfileCustomizationStore } from "@/domains/user/store/profileCustomization.store.js"
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function BannerProfilePortrait({
  photoSrc: photoSrcProp,
  frameSrc: frameSrcProp,
}) {
  const storePhoto = useProfileCustomizationStore((state) => state.photoSrc)
  const storeFrame = useProfileCustomizationStore((state) => state.frameSrc)
  const photoSrc = photoSrcProp ?? storePhoto ?? PLAYER_PROFILE_ASSETS.defaultPhoto
  const frameSrc = frameSrcProp ?? storeFrame ?? PLAYER_PROFILE_ASSETS.defaultBorder

  return (
    <div className={MY_PAGE_BANNER_PROFILE_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_LAYOUT}>
      <div className={MY_PAGE_BANNER_PROFILE_IMAGE_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_PHOTO_INSET}>
        <PublicAsset src={photoSrc} alt="" className={MY_PAGE_BANNER_PROFILE_IMAGE_CLASS} />
      </div>
      <PublicAsset src={frameSrc} alt="" className={MY_PAGE_BANNER_PROFILE_FRAME_CLASS} />
    </div>
  )
}
