import { useRef } from "react"

import InGameParchmentModalBase from "@/domains/game/ingame/components/parchment/InGameParchmentModalBase.js"
import { INGAME_PARCHMENT_CONFIRM_LABEL } from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import {
  EMOTICON_PALETTE_SAVE_SUCCESS_MESSAGE,
  EMOTICON_PALETTE_SAVE_SUCCESS_MESSAGE_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

/** 이모티콘 팔레트 저장 성공 — 양피지 모달.png 공용 셸(InGameParchmentModalBase). */
export default function EmoticonPaletteSaveSuccessModal({ open, onDismiss }) {
  const confirmButtonRef = useRef(null)

  if (!open) return null

  return (
    <InGameParchmentModalBase
      variantKey="emoticonPaletteSave"
      onDismiss={onDismiss}
      confirmLabel={INGAME_PARCHMENT_CONFIRM_LABEL}
      confirmButtonRef={confirmButtonRef}
      focusKey="save-success"
      wrapperProps={{ "data-emoticon-palette-save-success": "" }}
    >
      <p role="status" className={EMOTICON_PALETTE_SAVE_SUCCESS_MESSAGE_CLASS}>
        {EMOTICON_PALETTE_SAVE_SUCCESS_MESSAGE}
      </p>
    </InGameParchmentModalBase>
  )
}
