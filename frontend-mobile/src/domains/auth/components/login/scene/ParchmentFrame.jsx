// 인증 화면 가운데 양피지 액자와 그 안의 form
// login/scene/Scene.jsx가 씀
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { buildLoginParchmentFrameStyle } from "@m/domains/auth/constants/loginParchmentFrameStyle.js"

// 액자 폭: 폰은 화면 폭 거의 다, 태블릿·가로는 상한
const FRAME_WIDTH_CLASS = {
  default: "w-[94%] max-w-[20.5rem] land:max-w-[19rem]! md:w-full md:max-w-[28rem]",
  signup: "w-[94%] max-w-[20.5rem] land:max-w-[19rem]! md:w-full md:max-w-[28rem]",
}

const FRAME_STYLE = buildLoginParchmentFrameStyle()

// 내용이 길면 액자가 같이 길어짐 (안쪽 스크롤 없음, 페이지가 굴림), 브라우저 기본 입력 검사는 데스크톱처럼 켜 둠
export default function ParchmentFrame({ children, onSubmit, frameSize = "default" }) {
  // onSubmit 있을 때만 확인 효과음 뒤 넘김
  const handleSubmit = (event) => {
    if (typeof onSubmit !== "function") return
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <div className={`@container w-full ${FRAME_WIDTH_CLASS[frameSize] ?? FRAME_WIDTH_CLASS.default}`}>
      <form
        onSubmit={handleSubmit}
        style={FRAME_STYLE}
        className="flex aspect-[403/625] w-full flex-col justify-center gap-1.5"
      >
        {children}
      </form>
    </div>
  )
}
