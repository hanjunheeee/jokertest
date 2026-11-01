// 양피지 확인 버튼: 버튼 그림 위에 글자, 누르면 확인 소리
// 양피지 창 두 종류(ModalBase·ModalAnimated)와 밤 성공 자료 대기 창이 사용
import { createElement } from "react"
import {
  BTN_ASSET,
  CONFIRM_BTN_CLASS_TIGHT,
  IMG_CLASS,
  LABEL_CLASS,
  PARCHMENT_CONFIRM_LABEL,
} from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

// 그림 버튼 하나, buttonRef로 바깥에서 초점 줄 수 있음
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
