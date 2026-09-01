// 파일 역할: InGameParchmentConfirmButton.js - 파치먼트 모달 공용 확인 버튼입니다.
import { createElement } from "react"
import {
  INGAME_PARCHMENT_CONFIRM_BUTTON_ASSET,
  INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT,
  INGAME_PARCHMENT_CONFIRM_BUTTON_IMG_CLASS,
  INGAME_PARCHMENT_CONFIRM_BUTTON_LABEL_CLASS,
  INGAME_PARCHMENT_CONFIRM_LABEL,
} from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

/**
 * 파치먼트 모달 확인 버튼 — 이미지 위에 라벨을 얹는 공용 패턴.
 * createElement로만 구현해 .js 테스트가 그대로 import할 수 있게 한다.
 */
export default function InGameParchmentConfirmButton({
  label = INGAME_PARCHMENT_CONFIRM_LABEL,
  onClick,
  className = INGAME_PARCHMENT_CONFIRM_BUTTON_CLASS_TIGHT,
  buttonRef,
}) {
  return createElement(
    "button",
    {
      type: "button",
      ref: buttonRef,
      "aria-label": label,
      className,
      style: { outline: "none" },
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
