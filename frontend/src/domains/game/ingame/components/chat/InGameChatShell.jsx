import { AnimatePresence, motion } from "framer-motion"
import { useState } from "react"
import { INGAME_CHAT_PANEL_POSITION_CLASS, getInGameChatPanelWidthStyle } from "../../constants/ingameChatLayout.js"
import InGameChatContent from "./InGameChatContent.jsx"
import InGameChatToggleButton from "./InGameChatToggleButton.jsx"

const PANEL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

/**
 * 인게임 채팅 — 닫힘: 좌하단 열기 버튼 / 열림: 오버레이 + 채팅 패널
 */
export default function InGameChatShell({ hasUnread = false }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {!open ? (
        <InGameChatToggleButton
          hasUnread={hasUnread}
          onOpen={() => setOpen(true)}
        />
      ) : null}

      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              type="button"
              aria-label="채팅 닫기"
              className="absolute inset-0 z-20 cursor-default border-0 bg-black/25 p-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={PANEL_TRANSITION}
              onClick={() => setOpen(false)}
            />

            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="채팅"
              className={INGAME_CHAT_PANEL_POSITION_CLASS}
              style={getInGameChatPanelWidthStyle()}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              transition={PANEL_TRANSITION}
            >
              <InGameChatContent onClose={() => setOpen(false)} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
