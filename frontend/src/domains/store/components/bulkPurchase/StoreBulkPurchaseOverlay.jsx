import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import {
  STORE_BULK_PURCHASE_BACKDROP_CLASS,
  STORE_BULK_PURCHASE_PANEL_WRAP_CLASS,
  STORE_BULK_PURCHASE_TRANSITION,
} from "../../constants/storeBulkPurchaseLayout.js"
import StoreBulkPurchasePanel from "./StoreBulkPurchasePanel.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

/** 일괄구매 확인 — 상점 UI 위 오버레이 */
export default function StoreBulkPurchaseOverlay({ open, items, deadPreviewIds, onClose, onConfirm, purchaseState, onCheck, onRetry }) {
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      // F-16(AC-01): 열려 있을 때 실제로 onClose를 부르는 이 경로만 취소음을 낸다.
      dispatchUiSfx("ui-cancel", event)
      onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && items.length > 0 ? (
        <>
          <motion.button
            type="button"
            aria-label="일괄구매 확인 닫기"
            className={STORE_BULK_PURCHASE_BACKDROP_CLASS}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STORE_BULK_PURCHASE_TRANSITION}
            onClick={onClose}
          />

          <div className={STORE_BULK_PURCHASE_PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="선택 상품 구매 확인"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={STORE_BULK_PURCHASE_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <StoreBulkPurchasePanel
                items={items}
                deadPreviewIds={deadPreviewIds}
                onClose={onClose}
                onConfirm={onConfirm}
                purchaseState={purchaseState}
                onCheck={onCheck}
                onRetry={onRetry}
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
