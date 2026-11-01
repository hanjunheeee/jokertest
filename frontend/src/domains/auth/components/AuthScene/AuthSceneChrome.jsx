// 인증 화면 구석 장식: 왼쪽 위 이용 등급 그림, 오른쪽 아래 소리 조절
// components/AuthScene.jsx가 사용
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import SoundControl from "@/shared/ui/SoundControl.jsx"

// 등급 그림은 pointer-events 꺼서 아래 클릭을 안 막음
export default function AuthSceneChrome() {
  return (
    <>
      <PublicAsset
        src={LOGIN_ASSETS.ageRating}
        alt="전체이용가"
        className="pointer-events-none absolute left-4 top-4 z-10 h-auto w-[4.5rem] select-none sm:left-6 sm:top-6 sm:w-20"
      />

      <div className="absolute bottom-4 right-4 z-10 sm:bottom-6 sm:right-6">
        <SoundControl />
      </div>
    </>
  )
}
