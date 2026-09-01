/**
 * 플레이어 추방 모달 shell — document.body portal, 투표현황창 프레임.
 */
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { INGAME_KICK_PLAYER_MODAL_ASSETS } from "@/domains/game/ingame/constants/controls/ingameSetting/kickPlayer/ingameKickPlayerAssets.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "@/domains/game/ingame/constants/controls/ingameSetting/kickPlayer/ingameKickPlayerData.js"
import {
  getInGameKickPlayerPanelStyle,
  INGAME_KICK_PLAYER_MODAL_BACKDROP_CLASS,
  INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_CLASS,
  INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_IMG_CLASS,
  INGAME_KICK_PLAYER_MODAL_FRAME_IMAGE_CLASS,
  INGAME_KICK_PLAYER_MODAL_INNER_CLASS,
  INGAME_KICK_PLAYER_MODAL_INSET,
  INGAME_KICK_PLAYER_MODAL_SHELL_CLASS,
  INGAME_KICK_PLAYER_MODAL_TITLE_CLASS,
  INGAME_KICK_PLAYER_MODAL_WRAP_CLASS,
} from "@/domains/game/ingame/constants/controls/ingameSetting/kickPlayer/ingameKickPlayerLayout.js"
import SettingKickPlayerModalContent from "./SettingKickPlayerModalContent.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function SettingKickPlayerModal({ open, onClose }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div className={INGAME_KICK_PLAYER_MODAL_SHELL_CLASS} role="presentation">
      <button
        type="button"
        aria-label={INGAME_KICK_PLAYER_MODAL_COPY.closeAriaLabel}
        className={INGAME_KICK_PLAYER_MODAL_BACKDROP_CLASS}
        onClick={onClose}
      />

      <div className={INGAME_KICK_PLAYER_MODAL_WRAP_CLASS}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={INGAME_KICK_PLAYER_MODAL_COPY.title}
          className={`${INGAME_KICK_PLAYER_MODAL_INNER_CLASS} pointer-events-auto`}
          style={getInGameKickPlayerPanelStyle()}
          onClick={(event) => event.stopPropagation()}
        >
          <PublicAsset
            src={INGAME_KICK_PLAYER_MODAL_ASSETS.panelFrame}
            alt=""
            className={INGAME_KICK_PLAYER_MODAL_FRAME_IMAGE_CLASS}
          />

          <h2 className={INGAME_KICK_PLAYER_MODAL_TITLE_CLASS}>
            {INGAME_KICK_PLAYER_MODAL_COPY.title}
          </h2>

          <button
            type="button"
            aria-label={INGAME_KICK_PLAYER_MODAL_COPY.closeAriaLabel}
            onClick={onClose}
            className={INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_CLASS}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={INGAME_KICK_PLAYER_MODAL_ASSETS.closeButton}
              alt=""
              className={INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_IMG_CLASS}
            />
          </button>

          <div
            className="absolute inset-0 z-[2] flex min-h-0 flex-col"
            style={INGAME_KICK_PLAYER_MODAL_INSET}
          >
            <SettingKickPlayerModalContent />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
