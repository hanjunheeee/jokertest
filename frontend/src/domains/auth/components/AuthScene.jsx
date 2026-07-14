import { useRef } from "react"
import AuthBackgroundMedia from "@/domains/auth/components/AuthScene/AuthBackgroundMedia.jsx"
import AuthFrame from "@/domains/auth/components/AuthScene/AuthFrame.jsx"
import AuthSceneChrome from "@/domains/auth/components/AuthScene/AuthSceneChrome.jsx"
import { useBgmAutoplay } from "@/shared/hooks/useBgmAutoplay.js"

// 로그인/회원가입 화면의 공통 배경 장면
export default function AuthScene({ children, onSubmit }) {
  // 배경음악 audio 태그를 직접 제어하기 위한 ref
  const audioRef = useRef(null)

  // 화면에 들어오면 배경음악 재생을 시도
  useBgmAutoplay(audioRef)

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* 배경음악 audio와 전체 배경 영상을 담당합니다. */}
      <AuthBackgroundMedia audioRef={audioRef} />

      {/* 연령 등급 이미지와 사운드 조절 버튼처럼 화면 가장자리 요소를 담당합니다. */}
      <AuthSceneChrome audioRef={audioRef} />

      {/* 중앙 프레임과 그 안에 들어가는 로그인/회원가입 form 영역을 담당합니다. */}
      <AuthFrame onSubmit={onSubmit}>{children}</AuthFrame>
    </div>
  )
}
