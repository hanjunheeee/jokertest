import { createElement } from "react"
import {
  INGAME_PARCHMENT_CONFIRM_BUTTON_ASSET,
  INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT,
  INGAME_PARCHMENT_CONFIRM_BUTTON_IMG_CLASS,
  INGAME_PARCHMENT_CONFIRM_BUTTON_LABEL_CLASS,
  INGAME_PARCHMENT_CONFIRM_LABEL,
} from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

export default function InGameParchmentConfirmButton({
  label = INGAME_PARCHMENT_CONFIRM_LABEL,
  onClick,
  className = INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT,
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
      src: publicAsset(INGAME_PARCHMENT_CONFIRM_BUTTON_ASSET),
      alt: "",
      draggable: false,
      className: INGAME_PARCHMENT_CONFIRM_BUTTON_IMG_CLASS,
    }),
    createElement(
      "span",
      { className: INGAME_PARCHMENT_CONFIRM_BUTTON_LABEL_CLASS },
      label,
    ),
  )
}
