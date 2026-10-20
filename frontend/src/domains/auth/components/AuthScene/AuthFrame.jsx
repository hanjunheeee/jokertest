import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 로그인·회원가입 프레임 컨테이너 너비입니다(이미지는 w-full·h-auto로 비율 유지).
const AUTH_FRAME_SHELL_CLASS = {
  default: "relative w-full max-w-[min(26rem,94vw)]",
  signup: "relative w-full max-w-[min(30rem,94vw)]",
}

// 중앙 프레임 이미지와 그 안에 들어가는 실제 form 영역을 담당합니다.
export default function AuthFrame({ children, onSubmit, frameSize = "default" }) {
  /**
   * F-16(AC-01): 로그인·회원가입의 "확인"은 이 form submit 하나가 소유한다.
   *
   * 제출 버튼(type="submit") 클릭은 런타임의 generic capture가 이미 제외하므로, 마우스로
   * 버튼을 눌러도 Enter로 제출해도 소리는 정확히 한 번이다. 제출 핸들러가 없는(아직 배선되지
   * 않았거나 no-op인) 폼에서는 소리를 내지 않는다 — 아무 일도 일어나지 않는 입력에
   * 확인음을 붙이지 않는다.
   *
   * 소리는 업무 콜백보다 먼저 나가지만 그 결과·예외를 전파하지 않는다(AC-06).
   */
  const handleSubmit = (event) => {
    if (typeof onSubmit !== "function") return
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
      <div className={AUTH_FRAME_SHELL_CLASS[frameSize] ?? AUTH_FRAME_SHELL_CLASS.default}>
        {/* 폼 뒤에 깔리는 프레임 이미지입니다. */}
        <PublicAsset src={LOGIN_ASSETS.frame} alt="" className="pointer-events-none block h-auto w-full select-none" />

        {/* 프레임 이미지 안쪽 여백에 맞춰 실제 폼 영역을 겹쳐 올립니다. */}
        <div
          className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
          style={{ paddingTop: "22%", paddingBottom: "9%", paddingLeft: "13%", paddingRight: "13%" }}
        >
          {/* children에는 로그인 폼이나 회원가입 폼의 실제 입력 요소들이 들어옵니다. */}
          <form onSubmit={handleSubmit} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </form>
        </div>
      </div>
    </div>
  )
}
