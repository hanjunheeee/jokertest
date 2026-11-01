// 양피지 판: 양피지 그림 위에 내용, 그림 못 불러오면 그림 없는 대신 판
// 양피지 창 두 종류·밤 연출 대기 창이 사용
import { createElement, useState } from "react"
import {
  CONTENT_CLASS,
  FALLBACK_CONTENT_CLASS,
  FALLBACK_FRAME_CLASS,
  FRAME_CLASS,
  IMG_CLASS,
  IMG_URL,
} from "../../constants/parchment/ingameParchmentLayout.js"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

// 내용 칸 모양은 부르는 쪽이 정함, 나머지 속성은 틀 div에 붙임
export default function InGameParchmentPanelBase({
  children,
  contentClassName = "",
  frameClassName = FRAME_CLASS,
  fallbackFrameClassName = FALLBACK_FRAME_CLASS,
  contentBaseClassName = CONTENT_CLASS,
  fallbackContentBaseClassName = FALLBACK_CONTENT_CLASS,
  ...rest
}) {
  const [backgroundFailed, setBackgroundFailed] = useState(false)

  // 그림이 안 열리면 양피지 색 대신 판으로 바꿔 글이 배경에 안 묻히게 함
  if (backgroundFailed) {
    return createElement(
      "div",
      { className: fallbackFrameClassName, "data-parchment-fallback": "true", ...rest },
      createElement(
        "div",
        {
          className: `${fallbackContentBaseClassName} ${contentClassName}`.trim(),
          "data-parchment-content": "true",
        },
        children,
      ),
    )
  }

  return createElement(
    "div",
    { className: frameClassName, ...rest },
    createElement("img", {
      src: publicAsset(IMG_URL),
      alt: "",
      "aria-hidden": "true",
      draggable: false,
      className: IMG_CLASS,
      onError: () => setBackgroundFailed(true),
    }),
    createElement(
      "div",
      {
        className: `${contentBaseClassName} ${contentClassName}`.trim(),
        "data-parchment-content": "true",
      },
      children,
    ),
  )
}
