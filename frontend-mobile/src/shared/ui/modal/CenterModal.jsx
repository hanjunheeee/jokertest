// 밝은 가운데 창 틀 (어두운 뒤판·닫기 버튼·열고 닫는 움직임·Esc 닫기)
// 상점 일괄구매 확인·스킨 전신 창과 테두리 확대 창(BorderZoomModal)이 씀, 데스크톱 겹창 바깥 틀과 같은 동작
import { motion } from "framer-motion"
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import { BACKDROP_CLASS, CLOSE_BTN_CLASS, CLOSE_ICON_CLASS, PANEL_MOTION, WRAP_CLASS } from "./centerModalStyle.js"

// 열렸을 때만 그림, 뒤판·닫기 버튼·Esc로 닫음 (Esc·뒤판은 취소 소리, 닫기 버튼 소리는 closeSfx)
export default function CenterModal({ open, ariaLabel, closeLabel, closeSfx = false, onClose, transition, panelClassName, children }) {
  return (
    <SheetPortal open={open} onClose={onClose}>
      <>
        <motion.button
          key="backdrop"
          type="button"
          aria-label={closeLabel}
          className={BACKDROP_CLASS}
          data-sfx-kind="ui-cancel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          onClick={onClose}
        />
        <div key="wrap" className={WRAP_CLASS}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={panelClassName}
            {...PANEL_MOTION}
            transition={transition}
            onClick={(event) => event.stopPropagation()}
          >
            <CloseButton
              label={closeLabel}
              onClick={onClose}
              className={CLOSE_BTN_CLASS}
              iconClassName={CLOSE_ICON_CLASS}
              style={{ outline: "none" }}
              data-sfx-kind={closeSfx ? "ui-cancel" : undefined}
            />
            {children}
          </motion.div>
        </div>
      </>
    </SheetPortal>
  )
}
