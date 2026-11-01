import { useRef } from "react"

import InGameParchmentModalBase from "@/domains/game/ingame/components/parchment/InGameParchmentModalBase.js"
import { PARCHMENT_CONFIRM_LABEL } from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import {
  SAVE_SUCCESS_MSG,
  SAVE_SUCCESS_MSG_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

export default function EmoticonPaletteSaveSuccessModal({ open, onDismiss }) {
  const confirmButtonRef = useRef(null)

  if (!open) return null

  return (
    <InGameParchmentModalBase
      variantKey="emoticonPaletteSave"
      onDismiss={onDismiss}
      confirmLabel={PARCHMENT_CONFIRM_LABEL}
      confirmButtonRef={confirmButtonRef}
      focusKey="save-success"
      wrapperProps={{ "data-emoticon-palette-save-success": "" }}
    >
      <p role="status" className={SAVE_SUCCESS_MSG_CLASS}>
        {SAVE_SUCCESS_MSG}
      </p>
    </InGameParchmentModalBase>
  )
}
