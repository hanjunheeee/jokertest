import AuthBackgroundMedia from "@/domains/auth/components/AuthScene/AuthBackgroundMedia.jsx"
import AuthFrame from "@/domains/auth/components/AuthScene/AuthFrame.jsx"
import AuthSceneChrome from "@/domains/auth/components/AuthScene/AuthSceneChrome.jsx"

// 로그인/회원가입 화면의 공통 배경 장면
export default function AuthScene({ children, onSubmit, frameSize = "default" }) {
  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <AuthBackgroundMedia />

      <AuthSceneChrome />

      <AuthFrame onSubmit={onSubmit} frameSize={frameSize}>{children}</AuthFrame>
    </div>
  )
}
