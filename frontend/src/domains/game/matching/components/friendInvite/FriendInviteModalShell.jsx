import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { MODAL_ASSETS } from "../../constants/friendInviteModalAssets.js"
import { MODAL_COPY } from "../../constants/friendInviteModalCopy.js"
import {
  BACKDROP_CLASS,
  FRIEND_INVITE_MODAL_CLOSE_BTN_CLASS,
  FRIEND_INVITE_MODAL_CLOSE_BTN_IMG_CLASS,
  FRIEND_INVITE_MODAL_FRAME_IMAGE_CLASS,
  FRIEND_INVITE_MODAL_INNER_CLASS,
  FRIEND_INVITE_MODAL_INSET,
  SHELL_CLASS,
  FRIEND_INVITE_MODAL_TITLE_CLASS,
  WRAP_CLASS,
  getFriendInviteModalPanelStyle,
} from "../../constants/friendInviteModalLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export default function FriendInviteModalShell({ open, onClose, children }) {
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
    <div className={SHELL_CLASS} role="presentation">
      <button
        type="button"
        aria-label={MODAL_COPY.closeAriaLabel}
        className={BACKDROP_CLASS}
        data-sfx-kind="ui-cancel"
        onClick={onClose}
      />

      <div className={WRAP_CLASS}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={MODAL_COPY.title}
          className={`${FRIEND_INVITE_MODAL_INNER_CLASS} pointer-events-auto`}
          style={getFriendInviteModalPanelStyle()}
          onClick={(event) => event.stopPropagation()}
        >
          <PublicAsset
            src={MODAL_ASSETS.panelFrame}
            alt=""
            className={FRIEND_INVITE_MODAL_FRAME_IMAGE_CLASS}
          />

          <h2 className={FRIEND_INVITE_MODAL_TITLE_CLASS}>
            {MODAL_COPY.title}
          </h2>

          <button
            type="button"
            aria-label={MODAL_COPY.closeAriaLabel}
            onClick={onClose}
            data-sfx-kind="ui-cancel"
            className={FRIEND_INVITE_MODAL_CLOSE_BTN_CLASS}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={MODAL_ASSETS.closeButton}
              alt=""
              className={FRIEND_INVITE_MODAL_CLOSE_BTN_IMG_CLASS}
            />
          </button>

          <div
            className="absolute inset-0 z-[2] flex min-h-0 flex-col"
            style={FRIEND_INVITE_MODAL_INSET}
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
