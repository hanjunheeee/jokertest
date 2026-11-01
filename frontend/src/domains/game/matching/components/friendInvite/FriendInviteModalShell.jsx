// 친구 초대 창 틀: 어두운 바탕·틀 그림·제목·닫기 버튼, Esc로 닫기
// GameMatchingPage가 씀, 본문(FriendInviteModalContent)은 children으로 받음
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

// 친구 초대 창 틀 (document.body에 포털로 띄움)
export default function FriendInviteModalShell({ open, onClose, children }) {
  // 화면에 붙은 뒤부터 포털 그림
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 열려 있을 때만 Esc로 닫음 (닫기 효과음 같이 냄)
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

  // 붙기 전이거나 닫혀 있으면 안 그림
  if (!mounted || !open) return null

  return createPortal(
    <div className={SHELL_CLASS} role="presentation">
      {/* 바깥 어두운 바탕 누르면 닫힘 */}
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

          {/* 본문 자리, 안쪽 여백은 투표 창 틀과 같음 */}
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
