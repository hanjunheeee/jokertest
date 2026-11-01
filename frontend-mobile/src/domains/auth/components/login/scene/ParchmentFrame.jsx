// 인증 화면 가운데 양피지 액자와 그 안의 form
// login/scene/Scene.jsx가 씀
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 액자 폭: 폰은 화면 폭 거의 다, 태블릿·가로는 상한
const FRAME_WIDTH_CLASS = {
  default: "max-w-[26rem] land:max-w-[22rem]! md:max-w-[28rem]",
  signup: "max-w-[28rem] land:max-w-[24rem]! md:max-w-[30rem]",
}

// 액자 그림(403×625) 9칸 자르기: 위(가면 장식)·네 모서리는 그대로, 가운데만 늘림 → 내용이 길어도 장식이 안 찌그러짐
// 자르는 값은 그림 px, 그리는 굵기는 액자 폭(cqw) 비율이라 폭이 바뀌어도 그림 비율 그대로
const SLICE = { top: 140, side: 40, bottom: 46 }
const at = (px) => `calc(100cqw * ${px} / 403)`
const FRAME_STYLE = {
  borderStyle: "solid",
  borderWidth: 0,
  borderImageSource: `url("${publicAsset(LOGIN_ASSETS.frame)}")`,
  borderImageSlice: `${SLICE.top} ${SLICE.side} ${SLICE.bottom} fill`,
  borderImageWidth: `${at(SLICE.top)} ${at(SLICE.side)} ${at(SLICE.bottom)}`,
  borderImageRepeat: "stretch",
  // 안쪽 여백: 가면 장식 아래·테두리 안쪽부터 내용
  padding: `${at(132)} ${at(36)} ${at(44)}`,
}

// 내용이 길면 액자가 같이 길어짐 (안쪽 스크롤 없음, 페이지가 굴림)
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
        noValidate
        style={FRAME_STYLE}
        className="flex aspect-[403/625] w-full flex-col justify-center gap-2"
      >
        {children}
      </form>
    </div>
  )
}
