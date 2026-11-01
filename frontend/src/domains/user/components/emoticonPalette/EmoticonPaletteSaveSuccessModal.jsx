// 팔레트 저장 완료 창 (인게임 양피지 창을 같이 씀)
// EmoticonPalettePage가 씀
import { useRef } from "react"

import InGameParchmentModalBase from "@/domains/game/ingame/components/parchment/InGameParchmentModalBase.js"
import { PARCHMENT_CONFIRM_LABEL } from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import {
  SAVE_SUCCESS_MSG,
  SAVE_SUCCESS_MSG_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

// 닫혀 있으면 안 그림, 확인 버튼 ref는 뜰 때 초점용
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
