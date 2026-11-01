// 계정 찾기 화면 공통 틀 (배경 영상 + 위 줄 + 가운데 양피지 카드 form)
// pages/FindIdPage·PasswordResetRequestPage·PasswordResetPage가 씀, 데스크톱 AuthScene 자리
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import CardIntro from "../CardIntro.jsx"
import SceneBackground from "./SceneBackground.jsx"
import SceneTopBar from "./SceneTopBar.jsx"
import ParchmentCard from "./ParchmentCard.jsx"

// intro는 상태가 바뀌어도 늘 위에 있는 안내 문구, onBack 있으면 데스크톱처럼 카드 왼쪽 아래 뒤로 가기
export default function RecoveryScene({ intro, onSubmit, onBack, children }) {
  // 데스크톱 AuthFrame처럼 확인 효과음 뒤 넘김
  const handleSubmit = (event) => {
    if (typeof onSubmit !== "function") {
      event.preventDefault()
      return
    }
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <div className="relative flex min-h-full flex-col">
      <SceneBackground />
      <SceneTopBar />

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-4 land:py-2">
        <ParchmentCard className="max-w-[24rem] land:max-w-[26rem] md:max-w-[28rem]">
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            {intro && <CardIntro>{intro}</CardIntro>}
            {children}
            {onBack && (
              <div className="mt-auto flex pt-3">
                <BackButton onClick={onBack} />
              </div>
            )}
          </form>
        </ParchmentCard>
      </div>
    </div>
  )
}
