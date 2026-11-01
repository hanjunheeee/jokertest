import { createElement, useRef } from "react"
import {
  getEntranceMsg,
  CONFIRM_LABEL,
  MSG_CLASS,
} from "../../constants/phaseEntrance/ingamePhaseEntrance.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

export default function InGamePhaseEntranceOverlay({ open, phase, onConfirm }) {
  const confirmButtonRef = useRef(null)
  const message = getEntranceMsg(phase)
  const active = Boolean(open) && message !== null

  if (!active) return null

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
