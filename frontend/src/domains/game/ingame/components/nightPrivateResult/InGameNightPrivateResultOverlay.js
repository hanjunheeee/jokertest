// 파일 역할: InGameNightPrivateResultOverlay.js - NIGHT 개인 조사 결과 화면입니다.
import { createElement, useEffect, useRef } from "react"
import {
  INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_CLASS,
  INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_BUTTON_CLASS,
  INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS,
  INGAME_NIGHT_PRIVATE_RESULT_PANEL_CLASS,
  INGAME_NIGHT_PRIVATE_RESULT_PANEL_WRAP_CLASS,
} from "../../constants/nightPrivateResult/ingameNightPrivateResult.js"
import InGameParchmentPanelBase from "../parchment/InGameParchmentPanelBase.js"

/**
 * NIGHT 개인 조사 결과(GUARD의 조사·WITCH_HUNTER의 확인) — 전체 화면 파치먼트 오버레이.
 *
 * 배경·확인 버튼·Escape 닫기 계약은 DAY/NIGHT 진입 연출(InGamePhaseEntranceOverlay)과 완전히
 * 같다. 표시 전용이다: 어떤 소켓 emit도 하지 않고, 확인은 store의 nightPrivateResult를 비우는
 * 것으로만 이어진다 — 서버의 phase·역할 턴은 조금도 움직이지 않는다.
 *
 * 떠 있는 동안 backdrop이 화면 전체를 덮어 아래 게임 표면의 포인터 입력을 흡수하고,
 * Escape는 확인 버튼과 같은 처리를 한다. 키보드 초점은 열릴 때 확인 버튼으로 옮긴다.
 *
 * JSX가 아니라 createElement로 쓰인 이유는 InGameParchmentPanelBase.js 주석과 같다 —
 * 실제 프로덕션 DOM을 테스트가 그대로 검증할 수 있게 하기 위함이다.
 *
 * @param {object} props
 * @param {boolean} props.open 이 오버레이를 지금 띄워야 하는가(우선순위는 상위 스택이 정한다)
 * @param {"INVESTIGATE"|"CONFIRM"|null} props.kind 결과 종류 — 화면에는 쓰지 않고 data 속성으로만 노출한다
 * @param {string|null} props.label 화면에 그대로 나가는 본문 문구
 * @param {Function} props.onConfirm 확인/배경 클릭/Escape로 닫을 때 호출한다
 * @flow open이 false이거나 label이 비어 있으면 아무 것도 렌더링하지 않는다(effect도 걸지 않는다).
 */
export default function InGameNightPrivateResultOverlay({ open, kind, label, onConfirm }) {
  const confirmButtonRef = useRef(null)
  const active = Boolean(open) && typeof label === "string" && label.length > 0

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
  }, [active, label])

  if (!active) return null

  return createElement(
    "div",
    { "data-ingame-night-private-result": kind },
    createElement("button", {
      type: "button",
      "aria-label": INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_LABEL,
      className: INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_CLASS,
      onClick: onConfirm,
    }),
    createElement(
      "div",
      { className: INGAME_NIGHT_PRIVATE_RESULT_PANEL_WRAP_CLASS },
      createElement(
        "div",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL,
          className: INGAME_NIGHT_PRIVATE_RESULT_PANEL_CLASS,
        },
        createElement(
          InGameParchmentPanelBase,
          null,
          createElement("p", { className: INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS }, label),
          createElement(
            "button",
            {
              type: "button",
              ref: confirmButtonRef,
              className: INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_BUTTON_CLASS,
              onClick: onConfirm,
            },
            INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
          ),
        ),
      ),
    ),
  )
}
