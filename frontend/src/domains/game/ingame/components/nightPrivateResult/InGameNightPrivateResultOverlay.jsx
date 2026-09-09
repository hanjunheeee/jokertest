import { useRef } from "react"
import {
  INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS,
} from "../../constants/nightPrivateResult/ingameNightPrivateResult.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

/**
 * NIGHT 개인 결과 — 전체 화면 파치먼트 오버레이.
 *
 * 셸(backdrop·양피지·확인 버튼·Escape 닫기·열릴 때 확인 버튼으로 초점 이동)은
 * InGameParchmentModalBase가 담당하고, 이 파일은 서버가 내려준 결과 문구만 채운다 —
 * 역할 공개·밤 역할 턴 안내·DAY/NIGHT 진입 연출과 같은 셸이다.
 *
 * 표시 전용이다: 어떤 소켓 emit도 하지 않고, 확인은 store의 개인 결과를 비우는 것 외에
 * canonical phase·역할 턴을 조금도 건드리지 않는다(useInGameNightPrivateResult 참고).
 */
export default function InGameNightPrivateResultOverlay({ open, kind, label, onConfirm }) {
  const confirmButtonRef = useRef(null)
  const active = Boolean(open) && typeof label === "string" && label.length > 0

  if (!active) return null

  return (
    <InGameParchmentModalBase
      variantKey="nightPrivateResult"
      onDismiss={onConfirm}
      confirmLabel={INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL}
      confirmButtonRef={confirmButtonRef}
      focusKey={label}
      wrapperProps={{ "data-ingame-night-private-result": kind }}
    >
      <p className={INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS}>{label}</p>
    </InGameParchmentModalBase>
  )
}
