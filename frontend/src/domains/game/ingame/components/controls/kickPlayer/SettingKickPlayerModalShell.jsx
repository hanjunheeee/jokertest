import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { INGAME_KICK_PLAYER_MODAL_ASSETS } from "../../../constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../../constants/controls/kickPlayer/ingameKickPlayerData.js"
import {
  getInGameKickPlayerPanelStyle,
  MODAL_BACKDROP_CLASS,
  INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_CLASS,
  INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_IMG_CLASS,
  INGAME_KICK_PLAYER_MODAL_FRAME_IMAGE_CLASS,
  INGAME_KICK_PLAYER_MODAL_INNER_CLASS,
  INGAME_KICK_PLAYER_MODAL_INSET,
  MODAL_SHELL_CLASS,
  INGAME_KICK_PLAYER_MODAL_TITLE_CLASS,
  MODAL_WRAP_CLASS,
} from "../../../constants/controls/kickPlayer/ingameKickPlayerLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export default function SettingKickPlayerModalShell({ open, onClose, children }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onClose?.()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div className={MODAL_SHELL_CLASS} role="presentation">
      <button
        type="button"
        aria-label={INGAME_KICK_PLAYER_MODAL_COPY.closeAriaLabel}
        className={MODAL_BACKDROP_CLASS}
        data-sfx-kind="ui-cancel"
        onClick={onClose}
      />

      <div className={MODAL_WRAP_CLASS}>
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
            data-sfx-kind="ui-cancel"
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
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
