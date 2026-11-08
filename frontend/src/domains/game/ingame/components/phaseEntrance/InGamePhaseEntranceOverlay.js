import { createElement, useRef } from "react"
import {
  getEntranceMsg,
  CONFIRM_LABEL,
  MSG_CLASS,
} from "../../constants/ingamePhaseEntrance.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

export default function InGamePhaseEntranceOverlay({ open, phase, onConfirm }) {
  const confirmButtonRef = useRef(null)
  const message = getEntranceMsg(phase)
  const active = Boolean(open) && message !== null

  if (!active) return null

  // 확인 버튼 ref는 그리는 중에 읽지 않고 양피지 창에 넘기기만 함
  // eslint-disable-next-line react-hooks/refs -- ref 객체를 자식에 넘기는 것이라 읽기 아님
  return createElement(InGameParchmentModalBase, {
    variantKey: "phaseEntrance",
    onDismiss: onConfirm,
    confirmLabel: CONFIRM_LABEL,
    confirmButtonRef,
    focusKey: phase,
    wrapperProps: { "data-ingame-phase-entrance": phase },
    children: createElement(
      "p",
      { className: MSG_CLASS },
      message,
    ),
  })
}
