// 채팅 크게 보기 창: 큰 모양 채팅 내용, Esc·뒤 막·닫기 버튼으로 닫힘
// InGameChatShell이 씀
import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import { INGAME_CHAT_ASSETS } from "../../constants/chat/ingameChatAssets.js"
import {
  BACKDROP_CLASS,
  CLOSE_BTN_CLASS,
  PANEL_INNER_CLASS,
  PANEL_TRANSITION,
  PANEL_WRAP_CLASS,
  getCloseupPanelStyle,
} from "../../constants/chat/ingameChatCloseupLayout.js"
import InGameChatContent from "./InGameChatContent.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 열렸을 때만 그림, 내용은 InGameChatContent를 closeup 모양으로
export default function InGameChatCloseupOverlay({
  open,
  onClose,
  draft,
  messages,
  onDraftChange,
  onSend,
  status = null,
  error = null,
  truncateDraftOnInput = true,
}) {
  // 열렸을 때만 Esc로 닫기 (닫는 소리 같이 냄)
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  // 창 안 누름은 뒤 막 닫기로 번지지 않게 막음
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="채팅 클로즈업 닫기"
            className={BACKDROP_CLASS}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PANEL_TRANSITION}
            onClick={onClose}
          />

          <div
            className={PANEL_WRAP_CLASS}
            aria-hidden={!open}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="채팅 클로즈업"
              className={PANEL_INNER_CLASS}
              style={getCloseupPanelStyle()}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={PANEL_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label="채팅 클로즈업 닫기"
                onClick={onClose}
                data-sfx-kind="ui-cancel"
                className={CLOSE_BTN_CLASS}
              >
                <PublicAsset
                  src={INGAME_CHAT_ASSETS.closeButton}
                  alt=""
                  className="block h-auto w-full select-none"
                />
              </button>

              <InGameChatContent
                variant="closeup"
                draft={draft}
                messages={messages}
                onDraftChange={onDraftChange}
                onSend={onSend}
                status={status}
                error={error}
                truncateDraftOnInput={truncateDraftOnInput}
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
