// 아래에서 올라오는 인게임 시트 (뒤판·손잡이·제목·설명·닫기·스크롤 몸통·바닥 줄)
// 설정·기록·추방·방 코드 시트가 씀 (store BottomSheet 구조 복사, 데스크톱 옆 창·가운데 겹창 대신)
import { AnimatePresence, motion } from "framer-motion"
import { createPortal } from "react-dom"
import { useEscapeClose } from "../../../hooks/sheets/useEscapeClose.js"
import CloseButton from "./CloseButton.jsx"
import {
  BACKDROP_CLASS,
  PANEL_CLASS,
  PANEL_TONE_CLASS,
  SHEET_LAYERS,
  SHEET_SUBTITLE_CLASS,
  SHEET_TITLE_CLASS,
  SHEET_TRANSITION,
} from "./sheetStyle.js"

// 열렸을 때만 그림, 뒤판·Esc·닫기 버튼으로 닫음 (layer=top이면 다른 시트 위, 위 시트가 떠 있으면 escape=false로 Esc 양보)
export default function Sheet({
  open,
  title,
  subtitle = null,
  closeLabel,
  onClose,
  layer = "base",
  header = null,
  footer = null,
  testId,
  escape = true,
  children,
}) {
  useEscapeClose(open && escape, onClose)
  const z = SHEET_LAYERS[layer] ?? SHEET_LAYERS.base

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="backdrop"
            type="button"
            aria-label={closeLabel}
            className={`${BACKDROP_CLASS} ${z.backdrop}`}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SHEET_TRANSITION}
            onClick={onClose}
          />
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            data-testid={testId}
            className={`${PANEL_CLASS} ${PANEL_TONE_CLASS} ${z.panel}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_TRANSITION}
          >
            {/* 손잡이 모양 (끌기 동작은 없음, 시트라는 표시만) */}
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#f5ead2]/25" aria-hidden="true" />
            <header className="shrink-0 border-b border-[#8a6a3e]/35 pb-2 pl-4 pr-2">
              <div className="flex items-center gap-2">
                <h2 className={SHEET_TITLE_CLASS}>{title}</h2>
                <CloseButton label={closeLabel} onClose={onClose} />
              </div>
              {/* 설명은 폰 가로(키 낮음)에선 숨김 */}
              {subtitle ? <p className={`${SHEET_SUBTITLE_CLASS} pr-2 land:hidden`}>{subtitle}</p> : null}
              {/* 탭 줄처럼 스크롤 안 되는 머리 부품 */}
              {header ? <div className="pr-2 pt-2">{header}</div> : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-3 pb-3">
              {children}
            </div>
            {/* 바닥 줄: 안전영역만큼 띄움 (없으면 몸통이 띄움) */}
            {footer ? (
              <footer className="shrink-0 border-t border-[#8a6a3e]/35 px-4 pt-2 pb-[calc(0.6rem+env(safe-area-inset-bottom,0px))]">
                {footer}
              </footer>
            ) : (
              <div className="shrink-0 pb-[env(safe-area-inset-bottom,0px)]" aria-hidden="true" />
            )}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
