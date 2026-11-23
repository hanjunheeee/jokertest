// 로그인 화면: 이용 등급 아래·양피지 액자 위 가운데 브랜드 로고
// login/scene/Scene.jsx가 showBrandLogo일 때 씀
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function BrandLogo() {
  return (
    <div className="relative z-10 flex shrink-0 justify-center px-3 pb-0.5 pt-5 land:pb-0! land:pt-6! md:pb-1 md:pt-7">
      <PublicAsset
        src={LOGIN_ASSETS.brandLogo}
        alt="가면무도회"
        className="pointer-events-none h-auto w-[min(88vw,18.5rem)] select-none land:w-[min(52vw,14.5rem)]! md:w-[min(20.5rem,38vw)]"
      />
    </div>
  )
}
