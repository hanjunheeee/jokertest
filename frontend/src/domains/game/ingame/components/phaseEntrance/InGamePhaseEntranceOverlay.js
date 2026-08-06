// 파일 역할: InGamePhaseEntranceOverlay.js - DAY/NIGHT 진입 연출 화면입니다.
import { createElement, useEffect, useRef } from "react"
import {
  getInGamePhaseEntranceMessage,
  INGAME_PHASE_ENTRANCE_BACKDROP_CLASS,
  INGAME_PHASE_ENTRANCE_BACKDROP_LABEL,
  INGAME_PHASE_ENTRANCE_CONFIRM_BUTTON_CLASS,
  INGAME_PHASE_ENTRANCE_CONFIRM_LABEL,
  INGAME_PHASE_ENTRANCE_DIALOG_LABEL,
  INGAME_PHASE_ENTRANCE_MESSAGE_CLASS,
  INGAME_PHASE_ENTRANCE_PANEL_CLASS,
  INGAME_PHASE_ENTRANCE_PANEL_WRAP_CLASS,
} from "../../constants/phaseEntrance/ingamePhaseEntrance.js"
import InGameParchmentPanelBase from "../parchment/InGameParchmentPanelBase.js"

/**
 * DAY/NIGHT 진입 연출 — 전체 화면 파치먼트 오버레이.
 *
 * 배경은 역할 공개·밤 역할 턴 안내와 같은 공용 파치먼트 셸을 그대로 쓴다(이미지 비율 유지,
 * 로딩 실패 시 대체 패널). 표시 전용이다: 어떤 소켓 emit도 하지 않고, 닫아도 서버의
 * phase·역할 턴·역할 공개 확인은 조금도 움직이지 않는다(useInGamePhaseEntrance 참고).
 *
 * 떠 있는 동안 backdrop이 화면 전체를 덮어 아래 게임 표면의 포인터 입력을 흡수하고,
 * Escape/Enter/Space는 확인 버튼으로 처리된다. 키보드 초점은 열릴 때 확인 버튼으로 옮겨
 * 뒤쪽 컨트롤로 곧장 입력이 새지 않게 한다(역할 공개·밤 안내와 같은 모달 관례).
 *
 * JSX가 아니라 createElement로 쓰인 이유는 InGameParchmentPanelBase.js 주석과 같다 —
 * 실제 프로덕션 DOM을 테스트가 그대로 검증할 수 있게 하기 위함이다.
 */
export default function InGamePhaseEntranceOverlay({ open, phase, onConfirm }) {
  const confirmButtonRef = useRef(null)
  const message = getInGamePhaseEntranceMessage(phase)
  const active = Boolean(open) && message !== null

  useEffect(() => {
    if (!active) return undefined
    const onKeyDown = (event) => {
      if (event.key === "Escape") onConfirm()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active, onConfirm])

  useEffect(() => {
    if (!active) return
    confirmButtonRef.current?.focus()
  }, [active, phase])

  if (!active) return null

  return createElement(
    "div",
    { "data-ingame-phase-entrance": phase },
    createElement("button", {
      type: "button",
      "aria-label": INGAME_PHASE_ENTRANCE_BACKDROP_LABEL,
      className: INGAME_PHASE_ENTRANCE_BACKDROP_CLASS,
      onClick: onConfirm,
    }),
    createElement(
      "div",
      { className: INGAME_PHASE_ENTRANCE_PANEL_WRAP_CLASS },
      createElement(
        "div",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": INGAME_PHASE_ENTRANCE_DIALOG_LABEL,
          className: INGAME_PHASE_ENTRANCE_PANEL_CLASS,
        },
        createElement(
          InGameParchmentPanelBase,
          null,
          createElement("p", { className: INGAME_PHASE_ENTRANCE_MESSAGE_CLASS }, message),
          createElement(
            "button",
            {
              type: "button",
              ref: confirmButtonRef,
              className: INGAME_PHASE_ENTRANCE_CONFIRM_BUTTON_CLASS,
              onClick: onConfirm,
            },
            INGAME_PHASE_ENTRANCE_CONFIRM_LABEL,
          ),
        ),
      ),
    ),
  )
}
