// 파일 역할: InGameNightPrivateResultOverlay.js - NIGHT 개인 조사 결과 화면입니다.
import { createElement, useRef } from "react"
import {
  INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS,
} from "../../constants/nightPrivateResult/ingameNightPrivateResult.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

/**
 * NIGHT 개인 조사 결과 — 전체 화면 파치먼트 오버레이.
 * 셸은 InGameParchmentModalBase, 본문은 서버가 내려준 결과 문구만 채운다.
 */
export default function InGameNightPrivateResultOverlay({ open, kind, label, onConfirm }) {
  const confirmButtonRef = useRef(null)
  const active = Boolean(open) && typeof label === "string" && label.length > 0

  if (!active) return null

  return createElement(InGameParchmentModalBase, {
    variantKey: "nightPrivateResult",
    onDismiss: onConfirm,
    confirmLabel: INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
    confirmButtonRef,
    focusKey: label,
    wrapperProps: { "data-ingame-night-private-result": kind },
    children: createElement("p", { className: INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS }, label),
  })
}
