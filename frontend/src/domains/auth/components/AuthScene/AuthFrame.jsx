// 인증 화면 가운데 액자 그림과 그 안의 form
// components/AuthScene.jsx가 사용
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 액자 폭: 보통 / 가입 칸(더 넓게), 모르는 값은 보통
const AUTH_FRAME_SHELL_CLASS = {
  default: "relative w-full max-w-[min(26rem,94vw)]",
  signup: "relative w-full max-w-[min(30rem,94vw)]",
}

// 액자 그림 위에 form을 겹침, 안쪽 여백은 그림 테두리 비율에 맞춤
export default function AuthFrame({ children, onSubmit, frameSize = "default" }) {
  // onSubmit 있을 때만 확인 효과음 뒤 넘김
  const handleSubmit = (event) => {
    if (typeof onSubmit !== "function") return
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
      <div className={AUTH_FRAME_SHELL_CLASS[frameSize] ?? AUTH_FRAME_SHELL_CLASS.default}>
        <PublicAsset src={LOGIN_ASSETS.frame} alt="" className="pointer-events-none block h-auto w-full select-none" />

        <div
          className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
          style={{ paddingTop: "22%", paddingBottom: "9%", paddingLeft: "13%", paddingRight: "13%" }}
        >
          <form onSubmit={handleSubmit} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </form>
        </div>
      </div>
    </div>
  )
}
