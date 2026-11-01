// 인증 화면 공통 틀 (배경 영상 + 위 줄 + 가운데 액자 form)
// pages/LoginPage.jsx가 씀, 찾기·재설정 화면도 같이 쓸 수 있음
import Backdrop from "@m/domains/auth/components/login/scene/Backdrop.jsx"
import TopBar from "@m/domains/auth/components/login/scene/TopBar.jsx"
import ParchmentFrame from "@m/domains/auth/components/login/scene/ParchmentFrame.jsx"

// 액자가 화면보다 길면 페이지째 굴림 (틀 main이 세로 스크롤 맡음)
export default function Scene({ children, onSubmit, frameSize = "default" }) {
  return (
    <div className="relative flex min-h-full w-full flex-col overflow-x-hidden">
      <Backdrop />
      <TopBar />

      <div className="relative z-10 flex flex-1 items-center justify-center px-3 pb-4 pt-1 land:py-2! md:px-6 md:pb-8">
        <ParchmentFrame onSubmit={onSubmit} frameSize={frameSize}>{children}</ParchmentFrame>
      </div>
    </div>
  )
}
