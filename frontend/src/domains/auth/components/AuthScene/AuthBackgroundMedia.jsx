import { BGM_ASSETS } from "@/shared/constants/bgmAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"

// 로그인/회원가입 화면의 배경 소리와 배경 영상을 담당합니다.
export default function AuthBackgroundMedia({ audioRef }) {
  return (
    <>
      {/* 실제 소리를 재생하는 audio 태그입니다. 화면에는 보이지 않습니다. */}
      <audio ref={audioRef} src={publicAsset(BGM_ASSETS.loginMusic)} loop />

      {/* 로그인 화면 전체에 깔리는 배경 영상입니다. */}
      <video
        src={publicAsset(LOGIN_ASSETS.bgVideo)}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </>
  )
}
