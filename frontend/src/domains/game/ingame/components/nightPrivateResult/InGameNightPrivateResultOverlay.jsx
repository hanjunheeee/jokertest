import { useRef } from "react"
import {
  INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS,
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
      confirmLabel={INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL}
      confirmButtonRef={confirmButtonRef}
      focusKey={label}
      wrapperProps={{ "data-ingame-night-private-result": kind }}
    >
      <p className={INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS}>{label}</p>
    </InGameParchmentModalBase>
  )
}
