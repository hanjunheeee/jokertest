import { useRef } from 'react'
import InGameParchmentModalBase from '@/domains/game/ingame/components/parchment/InGameParchmentModalBase.js'
import { PARCHMENT_CONFIRM_LABEL } from '@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js'
import {
  BLOCKED_MSG_CLASS,
  BLOCKED_TITLE,
  BLOCKED_TITLE_CLASS,
} from '../constants/gameStartMessages.js'

export default function GameStartBlockedModal({ message, onClose }) {
  const confirmButtonRef = useRef(null)

  if (!message) return null

  return (
    <InGameParchmentModalBase
      variantKey="gameStartBlocked"
      onDismiss={onClose}
      confirmLabel={PARCHMENT_CONFIRM_LABEL}
      confirmButtonRef={confirmButtonRef}
      focusKey={message}
      wrapperProps={{ 'data-game-start-blocked': '' }}
    >
      <h2 className={BLOCKED_TITLE_CLASS}>
        {BLOCKED_TITLE}
      </h2>
      <p role="alert" className={BLOCKED_MSG_CLASS}>
        {message}
      </p>
    </InGameParchmentModalBase>
  )
}
