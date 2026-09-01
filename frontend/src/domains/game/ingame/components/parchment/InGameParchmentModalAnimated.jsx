// 파일 역할: InGameParchmentModalAnimated.jsx - 애니메이션 파치먼트 모달 셸입니다.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect } from "react"
import { INGAME_PARCHMENT_CONFIRM_LABEL } from "../../constants/parchment/ingameParchmentConfirmButton.js"
import { getInGameParchmentModalMotionPreset } from "../../constants/parchment/ingameParchmentModalMotion.js"
import { getInGameParchmentModalVariant } from "../../constants/parchment/ingameParchmentModalVariants.js"
import InGameParchmentConfirmButton from "./InGameParchmentConfirmButton.js"
import InGameParchmentPanel from "./InGameParchmentPanel.jsx"

function useParchmentModalEscape(onDismiss, open) {
  useEffect(() => {
    if (!open || !onDismiss) return undefined

    const onKeyDown = (event) => {
      if (event.key === "Escape") onDismiss()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onDismiss])
}

/**
 * 애니메이션 파치먼트 모달 — 역할 공개·밤 역할 턴 안내가 이 셸을 쓴다.
 * variant.animation에 따라 패널 등장 모션이 달라진다.
 */
export default function InGameParchmentModalAnimated({
  open,
  variantKey,
  onDismiss,
  confirmLabel = INGAME_PARCHMENT_CONFIRM_LABEL,
  parchmentProps = {},
  wrapProps = {},
  children,
}) {
  const prefersReducedMotion = useReducedMotion()
  const variant = getInGameParchmentModalVariant(variantKey)
  const motionPreset = getInGameParchmentModalMotionPreset(variant.animation)

  useParchmentModalEscape(onDismiss, open)

  if (!motionPreset) {
    throw new Error(`Animated parchment modal requires animation variant: ${variantKey}`)
  }

  const transition = prefersReducedMotion
    ? motionPreset.reducedTransition
    : motionPreset.transition
  const panelInitial = motionPreset.getPanelInitial(prefersReducedMotion)
  const panelAnimate = motionPreset.getPanelAnimate(prefersReducedMotion)
  const panelExit = motionPreset.getPanelExit(prefersReducedMotion)

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label={variant.backdropLabel}
            className={variant.backdropClass}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onDismiss}
          />

          <div className={variant.wrapClass} {...wrapProps}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={variant.dialogLabel}
              className={variant.panelClass}
              style={{ transformOrigin: motionPreset.transformOrigin }}
              initial={panelInitial}
              animate={panelAnimate}
              exit={panelExit}
              transition={transition}
              onClick={(event) => event.stopPropagation()}
            >
              <InGameParchmentPanel
                frameClassName={variant.parchmentFrameClass}
                fallbackFrameClassName={variant.parchmentFallbackFrameClass}
                contentClassName={variant.parchmentContentClass}
                {...parchmentProps}
              >
                {children}
                {onDismiss ? (
                  <InGameParchmentConfirmButton
                    label={confirmLabel}
                    onClick={onDismiss}
                    className={variant.confirmButtonClass}
                  />
                ) : null}
              </InGameParchmentPanel>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
