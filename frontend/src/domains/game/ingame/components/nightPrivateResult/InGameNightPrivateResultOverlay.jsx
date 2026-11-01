import { useRef } from "react"
import {
  CONFIRM_LABEL,
  PRIVATE_RESULT_MSG_CLASS,
} from "../../constants/nightPrivateResult/ingameNightPrivateResult.js"
import InGameParchmentModalBase from "../parchment/InGameParchmentModalBase.js"

export default function InGameNightPrivateResultOverlay({ open, kind, label, onConfirm }) {
  const confirmButtonRef = useRef(null)
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
