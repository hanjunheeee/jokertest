import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import {
  MY_PAGE_PROFILE_FRAME_CLASS,
  MY_PAGE_PROFILE_FRAME_WRAP_CLASS,
  MY_PAGE_PROFILE_PHOTO_CLASS,
} from "@/domains/user/constants/myPageLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function MyPageProfileFrame() {
  return (
    <div className={MY_PAGE_PROFILE_FRAME_WRAP_CLASS}>
      {/* 프로필 프레임 안쪽에 들어가는 사용자 이미지입니다. */}
      <PublicAsset
        src={MY_PAGE_ASSETS.profilePhoto}
        alt=""
        className={MY_PAGE_PROFILE_PHOTO_CLASS}
      />

      {/* 프로필 이미지 위에 씌우는 장식 프레임입니다. */}
      <PublicAsset src={MY_PAGE_ASSETS.profileFrame} alt="" className={MY_PAGE_PROFILE_FRAME_CLASS} />
    </div>
  )
}
