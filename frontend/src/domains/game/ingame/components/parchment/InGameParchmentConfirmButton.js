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
  // F-16(AC-01): 이 버튼의 의미는 "확인"이다. 표식만 달면 런타임의 document capture 단일
  // 소유자가 그 의미로 소리를 낸다 — 이 컴포넌트는 소리 코드를 직접 갖지 않는다(.js 테스트가
  // 그대로 import할 수 있어야 하므로 추가 의존을 만들지 않는다).
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
