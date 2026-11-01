// 인증 화면 공통 틀 (배경 영상 + 구석 장식 + 가운데 액자 form)
// pages/LoginPage.jsx·FindIdPage.jsx·passwordReset 폴더가 사용
import AuthBackgroundMedia from "@/domains/auth/components/AuthScene/AuthBackgroundMedia.jsx"
import AuthFrame from "@/domains/auth/components/AuthScene/AuthFrame.jsx"
import AuthSceneChrome from "@/domains/auth/components/AuthScene/AuthSceneChrome.jsx"

// 가입 칸은 frameSize="signup"으로 액자를 넓힘
export default function AuthScene({ children, onSubmit, frameSize = "default" }) {
  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <AuthBackgroundMedia />

      <AuthSceneChrome />

      <AuthFrame onSubmit={onSubmit} frameSize={frameSize}>{children}</AuthFrame>
    </div>
  )
}
