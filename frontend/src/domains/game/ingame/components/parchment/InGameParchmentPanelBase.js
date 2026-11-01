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
