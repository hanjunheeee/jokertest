// 인증 화면 위 줄: 왼쪽 이용 등급 그림, 오른쪽 소리 조절
// login/scene/Scene.jsx가 씀 (데스크톱은 왼쪽 위·오른쪽 아래 구석이었음)
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import SoundToggle from "@m/domains/auth/components/login/scene/SoundToggle.jsx"

// 가로 화면에선 높이를 아끼려고 위 줄을 액자 양옆 빈자리에 겹쳐 띄우고 등급 그림을 줄임
export default function TopBar() {
  return (
    <header className="relative z-10 flex shrink-0 items-center justify-between px-3 pt-2 land:absolute land:inset-x-0 land:top-0 land:px-4! land:pt-2! md:px-6 md:pt-4">
      <PublicAsset
        src={LOGIN_ASSETS.ageRating}
        alt="전체이용가"
        className="pointer-events-none h-auto w-12 select-none land:w-9! md:w-16"
      />
      <SoundToggle />
    </header>
  )
}
