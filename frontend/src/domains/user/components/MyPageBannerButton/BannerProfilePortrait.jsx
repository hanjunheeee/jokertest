// 배너 초상 (장착한 프로필 사진·테두리)
// BannerMainButton이 씀
import { useEffect } from "react"
import {
  LOBBY_BANNER_PROFILE_LAYOUT,
  LOBBY_BANNER_PROFILE_PHOTO_INSET,
  PROFILE_FRAME_CLASS,
  PROFILE_IMG_CLASS,
  PROFILE_IMG_WRAP_CLASS,
  PROFILE_WRAP_CLASS,
} from "../../constants/myPageBannerStyle.js"
import { useProfileCustomizationStore } from "../../store/profileCustomization.store.js"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import { PLAYER_PROFILE_ASSETS } from "../../../../shared/constants/playerProfileAssets.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 받은 그림이 없으면 꾸미기 스토어 값, 그것도 없으면 기본 그림
export default function BannerProfilePortrait({
  photoSrc: photoSrcProp,
  frameSrc: frameSrcProp,
}) {
  const storePhoto = useProfileCustomizationStore((state) => state.photoSrc)
  const storeFrame = useProfileCustomizationStore((state) => state.frameSrc)

  // 처음 그릴 때 지갑 요약 받기 (장착값이 꾸미기 스토어로 들어옴)
  useEffect(() => {
    useEconomyStore.getState().fetchSummary()
  }, [])

  const photoSrc = photoSrcProp ?? storePhoto ?? PLAYER_PROFILE_ASSETS.defaultPhoto
  const frameSrc = frameSrcProp ?? storeFrame ?? PLAYER_PROFILE_ASSETS.defaultBorder

  return (
    <div className={PROFILE_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_LAYOUT}>
      <div className={PROFILE_IMG_WRAP_CLASS} style={LOBBY_BANNER_PROFILE_PHOTO_INSET}>
        <PublicAsset src={photoSrc} alt="" className={PROFILE_IMG_CLASS} />
      </div>
      <PublicAsset src={frameSrc} alt="" className={PROFILE_FRAME_CLASS} />
    </div>
  )
}
