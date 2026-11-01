// 밤 개인 결과 창: 조사·확인 결과나 암살 실패 문구를 양피지로
// 인게임 화면이 사용, 문구는 useInGameNightPrivateResult가 만듦
import { useRef } from "react"
import {
  CONFIRM_LABEL,
  PRIVATE_RESULT_MSG_CLASS,
} from "../../constants/ingameNightPrivateResult.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

// 확인·바깥 누름·Esc 모두 onConfirm, 문구 바뀌면 확인 버튼에 다시 초점
export default function InGameNightPrivateResultOverlay({ open, kind, label, onConfirm }) {
  const confirmButtonRef = useRef(null)
  // 열림이어도 문구가 비었으면 안 띄움
  const active = Boolean(open) && typeof label === "string" && label.length > 0

  if (!active) return null

  return (
    <InGameParchmentModalBase
      variantKey="nightPrivateResult"
      onDismiss={onConfirm}
      confirmLabel={CONFIRM_LABEL}
      confirmButtonRef={confirmButtonRef}
      focusKey={label}
      wrapperProps={{ "data-ingame-night-private-result": kind }}
    >
      <p className={PRIVATE_RESULT_MSG_CLASS}>{label}</p>
    </InGameParchmentModalBase>
  )
}
