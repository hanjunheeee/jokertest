import { useRef } from 'react'
import InGameParchmentModalBase from '@/domains/game/ingame/components/parchment/InGameParchmentModalBase.js'
import { INGAME_PARCHMENT_CONFIRM_LABEL } from '@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js'
import {
  GAME_START_BLOCKED_MESSAGE_CLASS,
  GAME_START_BLOCKED_TITLE,
  GAME_START_BLOCKED_TITLE_CLASS,
} from '../constants/gameStartMessages.js'

export default function GameStartBlockedModal({ message, onClose }) {
  const confirmButtonRef = useRef(null)

  if (!message) return null

  return (
    <InGameParchmentModalBase
      variantKey="gameStartBlocked"
      onDismiss={onClose}
      confirmLabel={INGAME_PARCHMENT_CONFIRM_LABEL}
      confirmButtonRef={confirmButtonRef}
      focusKey={message}
      wrapperProps={{ 'data-game-start-blocked': '' }}
    >
      <h2 className={GAME_START_BLOCKED_TITLE_CLASS}>
        {GAME_START_BLOCKED_TITLE}
      </h2>
      <p role="alert" className={GAME_START_BLOCKED_MESSAGE_CLASS}>
        {message}
      </p>
    </InGameParchmentModalBase>
  )
}
