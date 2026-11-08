// 추방 창 틀: 화면 덮개·투표 창 틀 그림·제목·닫기 버튼 (body에 띄움)
// 설정 추방 창(SettingKickPlayerModal)·GameMatchingPage가 사용
import { useRef } from "react"
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
import { useInGameModalLayer } from "../../../hooks/useInGameModalLayer.js"

// 창 틀만 맡고 안쪽 내용은 children으로 받음
export default function SettingKickPlayerModalShell({ open, onClose, children }) {
  // 열려 있고 맨 위 창이면 Esc로 닫기(취소 효과음 같이), 초점은 창 안으로 옮기고 가둠
  const dialogRef = useRef(null)
  useInGameModalLayer({ open, onClose: onClose ?? null, containerRef: dialogRef })

  // 닫혀 있거나 body가 없으면 안 그림
  if (!open || typeof document === "undefined" || !document.body) return null

  // 덮개·닫기 버튼은 취소 효과음, 창 안 클릭은 바깥으로 안 번지게 막기
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
          ref={dialogRef}
          tabIndex={-1}
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
            className={`${INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_CLASS} outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]`}
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
