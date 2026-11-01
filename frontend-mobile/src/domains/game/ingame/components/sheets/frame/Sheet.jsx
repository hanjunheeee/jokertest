// 아래에서 올라오는 인게임 시트 (뒤판·양피지 틀·머리 판 제목·설명·닫기·스크롤 몸통·바닥 줄)
// 설정·기록 시트가 씀, 데스크톱 옆 창(SidePanel + SidePanelHeader)과 같은 그림·글을 바닥 시트로 옮김
import { AnimatePresence, motion } from "framer-motion"
import { createPortal } from "react-dom"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useEscapeClose } from "../../../hooks/sheets/useEscapeClose.js"
import CloseButton from "./CloseButton.jsx"
import {
  BACKDROP_CLASS,
  HEADER_PLATE_SRC,
  PANEL_CLASS,
  PANEL_FRAME_STYLE,
  SHEET_LAYERS,
  SHEET_SUBTITLE_CLASS,
  SHEET_TITLE_CLASS,
  SHEET_TRANSITION,
} from "./sheetStyle.js"

// 열렸을 때만 그림, 뒤판·Esc·닫기 버튼으로 닫음 (위 창이 떠 있으면 escape=false로 Esc 양보)
export default function Sheet({
  open,
  title,
  ariaLabel = title,
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
            aria-label={ariaLabel}
            data-testid={testId}
            className={`${PANEL_CLASS} ${z.panel}`}
            style={PANEL_FRAME_STYLE}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_TRANSITION}
          >
            <header className="shrink-0 px-2 pt-1">
              {/* 머리 판 그림 위 제목, 오른쪽 닫기 */}
              <div className="flex items-center gap-1">
                <div className="relative min-w-0 flex-1">
                  <PublicAsset src={HEADER_PLATE_SRC} alt="" className="block h-auto max-h-14 w-full select-none object-fill" />
                  <h2 className={SHEET_TITLE_CLASS}>{title}</h2>
                </div>
                <CloseButton label={closeLabel} onClose={onClose} />
              </div>
              {/* 설명은 폰 가로(키 낮음)에선 숨김 */}
              {subtitle ? <p className={`${SHEET_SUBTITLE_CLASS} land:hidden`}>{subtitle}</p> : null}
              {/* 탭 줄처럼 스크롤 안 되는 머리 부품 */}
              {header ? <div className="pt-2">{header}</div> : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pt-2 pb-2">
              {children}
            </div>
            {/* 바닥 줄: 안전영역만큼 띄움 (없으면 몸통이 띄움) */}
            {footer ? (
              <footer className="shrink-0 px-2 pt-1 pb-[env(safe-area-inset-bottom,0px)]">
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
