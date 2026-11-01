// 인증 화면 위 줄: 왼쪽 이용 등급 그림 (데스크톱 AuthSceneChrome의 왼쪽 위 구석)
// login/scene/Scene.jsx가 씀, 소리 조절은 데스크톱처럼 오른쪽 아래(SoundCorner.jsx)
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 가로 화면에선 높이를 아끼려고 액자 옆 빈자리에 겹쳐 띄우고 등급 그림을 줄임, 큰 화면(lg)도 옆 빈자리에 띄움
export default function TopBar() {
  return (
    <header className="relative z-10 flex shrink-0 items-center px-3 pt-2 land:absolute land:left-0 land:top-0 land:px-4! land:pt-2! md:px-6 md:pt-4 lg:absolute lg:left-0 lg:top-0">
      <PublicAsset
        src={LOGIN_ASSETS.ageRating}
        alt="전체이용가"
        className="pointer-events-none h-auto w-12 select-none land:w-9! md:w-16"
      />
    </header>
  )
}
