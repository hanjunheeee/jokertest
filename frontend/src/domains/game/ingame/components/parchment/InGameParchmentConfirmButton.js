import { createElement } from "react"
import {
  BTN_ASSET,
  CONFIRM_BTN_CLASS_TIGHT,
  IMG_CLASS,
  LABEL_CLASS,
  PARCHMENT_CONFIRM_LABEL,
} from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

export default function InGameParchmentConfirmButton({
  label = PARCHMENT_CONFIRM_LABEL,
  onClick,
  className = CONFIRM_BTN_CLASS_TIGHT,
  buttonRef,
  sfxKind = "ui-confirm",
}) {
  return createElement(
    "button",
    {
      type: "button",
      ref: buttonRef,
      "aria-label": label,
      className,
      style: { outline: "none" },
      "data-sfx-kind": sfxKind,
      onClick,
    },
    createElement("img", {
      src: publicAsset(BTN_ASSET),
      alt: "",
      draggable: false,
      className: IMG_CLASS,
    }),
    createElement(
      "span",
      { className: LABEL_CLASS },
      label,
    ),
  )
}
