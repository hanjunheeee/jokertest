import { createElement, useRef } from "react"
import {
  getInGamePhaseEntranceMessage,
  INGAME_PHASE_ENTRANCE_CONFIRM_LABEL,
  INGAME_PHASE_ENTRANCE_MESSAGE_CLASS,
} from "../../constants/phaseEntrance/ingamePhaseEntrance.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

export default function InGamePhaseEntranceOverlay({ open, phase, onConfirm }) {
  const confirmButtonRef = useRef(null)
  const message = getInGamePhaseEntranceMessage(phase)
  const active = Boolean(open) && message !== null

  if (!active) return null

  return createElement(InGameParchmentModalBase, {
    variantKey: "phaseEntrance",
    onDismiss: onConfirm,
    confirmLabel: INGAME_PHASE_ENTRANCE_CONFIRM_LABEL,
    confirmButtonRef,
    focusKey: phase,
    wrapperProps: { "data-ingame-phase-entrance": phase },
    children: createElement(
      "p",
      { className: INGAME_PHASE_ENTRANCE_MESSAGE_CLASS },
      message,
    ),
  })
}
