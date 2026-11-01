// 시트를 body로 띄우는 틀 (열림·닫힘 움직임 + Esc 닫기)
// 상점·대기방·착용·서고·튜토리얼 시트가 씀
import { AnimatePresence } from "framer-motion"
import { createPortal } from "react-dom"
import { useEscapeClose } from "@m/shared/hooks/useEscapeClose.js"

// 화면 틀(.mobile-shell)이 container라 fixed가 틀에 갇힘 → body로 뺌
// onClose 없으면 Esc 안 받음, escSfx면 Esc 때 취소 소리
export default function SheetPortal({ open, onClose = null, escSfx = true, children }) {
  useEscapeClose(open && Boolean(onClose), onClose, { sfx: escSfx })

  return createPortal(<AnimatePresence>{open ? children : null}</AnimatePresence>, document.body)
}
