// 계정 찾기 화면 공통 틀 (배경 영상 + 위 줄 + 가운데 양피지 카드 form)
// pages/FindIdPage·PasswordResetRequestPage·PasswordResetPage가 씀, 데스크톱 AuthScene 자리
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import SceneBackground from "./SceneBackground.jsx"
import SceneTopBar from "./SceneTopBar.jsx"
import ParchmentCard from "./ParchmentCard.jsx"

// form에 id를 줘서 바닥 줄(form 바깥 portal)의 제출 버튼이 이 form을 가리키게 함
export default function RecoveryScene({ formId, onSubmit, onBack, children }) {
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
      <SceneTopBar onBack={onBack} />

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-4 land:py-2">
        <ParchmentCard className="max-w-[24rem] land:max-w-[26rem] md:max-w-[28rem]">
          <form id={formId} onSubmit={handleSubmit} className="flex flex-1 flex-col">
            {children}
          </form>
        </ParchmentCard>
      </div>
    </div>
  )
}
