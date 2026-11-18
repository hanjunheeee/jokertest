// 낮·밤 들어갈 때 뜨는 확인 창 (재판 없이 밤이면 까닭 한 줄 같이)
// InGamePage가 씀
import { createElement, Fragment, useRef } from "react"
import {
  getEntranceMsg,
  getNightReasonMsg,
  CONFIRM_LABEL,
  MSG_CLASS,
  REASON_CLASS,
} from "../../constants/ingamePhaseEntrance.js"
import { useInGameStore } from "../../store/ingameStore.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

// 지금 밤이면 그날 낮 투표 판정 결과 (새 낮이 되면 판정이 지워져 지난 날 것은 안 남음)
const selectNightOutcome = (s) => (s.state?.phase === "NIGHT" ? (s.state.dayVoteResolution?.outcome ?? null) : null)

export default function InGamePhaseEntranceOverlay({ open, phase, onConfirm }) {
  const confirmButtonRef = useRef(null)
  const message = getEntranceMsg(phase)
  const reason = getNightReasonMsg(phase, useInGameStore(selectNightOutcome))
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
      Fragment,
      null,
      createElement("p", { className: MSG_CLASS }, message),
      reason === null
        ? null
        : createElement("p", { className: REASON_CLASS, "data-ingame-phase-entrance-reason": "" }, reason),
    ),
  })
}
