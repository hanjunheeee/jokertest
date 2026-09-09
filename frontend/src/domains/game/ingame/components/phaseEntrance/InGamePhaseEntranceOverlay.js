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
 *
 * 셸(backdrop·양피지·확인 버튼·Escape 닫기·열릴 때 확인 버튼으로 초점 이동)은
 * InGameParchmentModalBase가 담당하고, 이 파일은 phase별 진입 문구만 채운다.
 *
 * 표시 전용이다: 어떤 소켓 emit도 하지 않고, 닫아도 서버의 phase·역할 턴·역할 공개 확인은
 * 조금도 움직이지 않는다(useInGamePhaseEntrance 참고).
 *
 * JSX가 아니라 createElement로 쓰인 이유는 InGameParchmentPanelBase.js 주석과 같다 —
 * 실제 프로덕션 DOM을 테스트가 그대로 검증할 수 있게 하기 위함이다.
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
