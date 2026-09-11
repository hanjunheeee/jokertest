import { useEffect } from "react"
import {
  LOBBY_BANNER_PROFILE_LAYOUT,
  LOBBY_BANNER_PROFILE_PHOTO_INSET,
  MY_PAGE_BANNER_PROFILE_FRAME_CLASS,
  MY_PAGE_BANNER_PROFILE_IMAGE_CLASS,
  MY_PAGE_BANNER_PROFILE_IMAGE_WRAP_CLASS,
  MY_PAGE_BANNER_PROFILE_WRAP_CLASS,
} from "../../constants/myPageBannerStyle.js"
import { useProfileCustomizationStore } from "../../store/profileCustomization.store.js"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import { PLAYER_PROFILE_ASSETS } from "../../../../shared/constants/playerProfileAssets.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// F-12(AC-06/A-12): 이 컴포넌트가 실제 장착 테두리(profileCustomization store의 frameSrc)를
// 보여주는 지점이다 — 마이페이지·로비 배너 어디서든 마운트되는 즉시 서버 loadout을
// 확보해서, 프로필 수정 편집기를 한 번도 열지 않아도 재로그인/새로고침 후 복원된 테두리가
// 곧바로 보이게 한다(StorePanel이 상점 진입 시 같은 이유로 fetchSummary를 부르는 것과 같은
// 관례). fetchSummary는 GET이라 반복 호출해도 안전하다(A-09).
export default function BannerProfilePortrait({
  photoSrc: photoSrcProp,
  frameSrc: frameSrcProp,
}) {
  const storePhoto = useProfileCustomizationStore((state) => state.photoSrc)
  const storeFrame = useProfileCustomizationStore((state) => state.frameSrc)

  useEffect(() => {
    useEconomyStore.getState().fetchSummary()
  }, [])

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
