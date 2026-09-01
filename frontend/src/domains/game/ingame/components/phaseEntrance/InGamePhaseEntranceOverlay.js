// 파일 역할: InGamePhaseEntranceOverlay.js - DAY/NIGHT 진입 연출 화면입니다.
import { createElement, useRef } from "react"
import {
  getInGamePhaseEntranceMessage,
  INGAME_PHASE_ENTRANCE_CONFIRM_LABEL,
  INGAME_PHASE_ENTRANCE_MESSAGE_CLASS,
} from "../../constants/phaseEntrance/ingamePhaseEntrance.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

/**
 * DAY/NIGHT 진입 연출 — 전체 화면 파치먼트 오버레이.
 * 셸은 InGameParchmentModalBase, 본문은 phase별 진입 문구만 채운다.
 */
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
