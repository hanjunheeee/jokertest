import { createElement, useState } from "react"
import {
  INGAME_PARCHMENT_CONTENT_CLASS,
  INGAME_PARCHMENT_FALLBACK_CONTENT_CLASS,
  INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
  INGAME_PARCHMENT_FRAME_CLASS,
  INGAME_PARCHMENT_IMAGE_CLASS,
  INGAME_PARCHMENT_IMAGE_URL,
} from "../../constants/parchment/ingameParchmentLayout.js"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

export default function InGameParchmentPanelBase({
  children,
  contentClassName = "",
  frameClassName = INGAME_PARCHMENT_FRAME_CLASS,
  fallbackFrameClassName = INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
  contentBaseClassName = INGAME_PARCHMENT_CONTENT_CLASS,
  fallbackContentBaseClassName = INGAME_PARCHMENT_FALLBACK_CONTENT_CLASS,
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
      src: publicAsset(INGAME_PARCHMENT_IMAGE_URL),
      alt: "",
      "aria-hidden": "true",
      draggable: false,
      className: INGAME_PARCHMENT_IMAGE_CLASS,
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
