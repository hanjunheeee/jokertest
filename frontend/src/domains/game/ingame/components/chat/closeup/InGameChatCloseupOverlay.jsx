// 파일 역할: InGameChatCloseupOverlay.jsx - 화면을 구성하는 컴포넌트입니다.
import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import { INGAME_CHAT_ASSETS } from "../../../constants/chat/ingameChatAssets.js"
import {
  INGAME_CHAT_CLOSEUP_BACKDROP_CLASS,
  INGAME_CHAT_CLOSEUP_CLOSE_BUTTON_CLASS,
  INGAME_CHAT_CLOSEUP_PANEL_INNER_CLASS,
  INGAME_CHAT_CLOSEUP_PANEL_TRANSITION,
  INGAME_CHAT_CLOSEUP_PANEL_WRAP_CLASS,
  getInGameChatCloseupPanelStyle,
} from "../../../constants/chat/closeup/ingameChatCloseupLayout.js"
import InGameChatContent from "../InGameChatContent.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

/**
 * 인게임 채팅 클로즈업 — 전체 화면 오버레이
 */
export default function InGameChatCloseupOverlay({
  open,
  onClose,
  draft,
  messages,
  onDraftChange,
  onSend,
}) {
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="채팅 클로즈업 닫기"
            className={INGAME_CHAT_CLOSEUP_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={INGAME_CHAT_CLOSEUP_PANEL_TRANSITION}
            onClick={onClose}
          />

          <div
            className={INGAME_CHAT_CLOSEUP_PANEL_WRAP_CLASS}
            aria-hidden={!open}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="채팅 클로즈업"
              className={INGAME_CHAT_CLOSEUP_PANEL_INNER_CLASS}
              style={getInGameChatCloseupPanelStyle()}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={INGAME_CHAT_CLOSEUP_PANEL_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label="채팅 클로즈업 닫기"
                onClick={onClose}
                className={INGAME_CHAT_CLOSEUP_CLOSE_BUTTON_CLASS}
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
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
