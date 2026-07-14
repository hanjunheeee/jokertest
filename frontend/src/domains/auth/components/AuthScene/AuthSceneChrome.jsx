import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import SoundControl from "@/shared/ui/SoundControl.jsx"

// 화면 가장자리의 고정 요소들을 담당합니다.
export default function AuthSceneChrome({ audioRef }) {
  return (
    <>
      {/* 좌측 상단 연령 등급 이미지입니다. */}
      <PublicAsset
        src={LOGIN_ASSETS.ageRating}
        alt="전체이용가"
        className="pointer-events-none absolute left-4 top-4 z-10 h-auto w-[4.5rem] select-none sm:left-6 sm:top-6 sm:w-20"
      />

      {/* 우측 하단 배경음악 조절 버튼입니다. */}
      <div className="absolute bottom-4 right-4 z-10 sm:bottom-6 sm:right-6">
        <SoundControl audioRef={audioRef} />
      </div>
    </>
  )
}
